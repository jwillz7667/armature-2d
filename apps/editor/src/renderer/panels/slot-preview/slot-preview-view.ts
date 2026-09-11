import { Container, Text, TextStyle, type Ticker } from 'pixi.js';
import type { SpinResult } from '@marionette/math-bridge';
import { prepareSlotPreview, type SlotPreviewInput } from './slot-preview-input';
import { createSlotPreviewSimulation, type SlotPreviewSimulation } from './slot-preview-simulation';
import { atlasTextureStore, effectsTextureStore } from '../../editor-state/atlas-texture-store';
import type { EscalationTier, PresentationTimeline } from '@marionette/runtime-core';
import {
  SlotSceneView,
  SkeletonView,
  ParticleLayerView,
  cellCenter,
  gridMetrics,
  gridSize,
  type GridMetrics,
  type SlotSceneCallbacks,
} from '@marionette/runtime-web';
import type { GridConfig } from '@marionette/format/slot-types';
import { documentHost } from '../../document';
import { createPreviewStage, type PreviewStage } from '../preview/preview-stage';
import { fitSize } from '../preview/preview-fit';
import {
  advancePreview,
  cyclePreviewBackground,
  makePreviewTransport,
  pausePreview,
  playPreview,
  restartPreview,
  setPreviewBackground,
  togglePreviewPlay,
  type PreviewBackground,
  type PreviewTransport,
} from '../preview/preview-transport';
import {
  DEFAULT_SLOT_PREVIEW_SCENARIO,
  resolveSlotPlayhead,
  type SlotPreviewScenarioId,
} from './slot-preview-model';

// The slot panel scene preview (PP-D8 deliverable 2). It mounts the runtime-web SlotSceneView, which plays a
// PresentationTimeline (the reel stops, symbol landings, win-cell highlights, and counter rollup) exactly as
// the packaged player does, driven by a committed MockMathEngine scenario the selector picks. LAW 1 holds:
// the outcome is always a committed SpinResult run through the shared runtime-core `sequence`; nothing here
// invents a symbol or a payout. The preview is read-only over the document: it re-exports the authored slot
// scene (exportSlotSceneDocument, a pure projection) and re-sequences when the scene changes, but never
// issues a command.
//
// Symbols resolve against the project's authored skeleton and texture store. Unresolved symbols keep
// diagnostic labels. Effects and bundles use the same fixed preview clock; entered flow animations
// mount as cinematics. Recorded outcomes remain transient inputs outside the document.
//
// Lifecycle mirrors the viewport: async Application init guarded against an unmount race, a ticker that
// throttles while the dockview tab is hidden, and a full destroy that tears down every SkeletonView the
// SlotSceneView pooled plus the glyph texts. The glyph overlay refreshes off the 60fps path (a throttled
// describe()), so the steady per-frame path stays the runtime-web allocation-free advance.

const FIT_PADDING = 20;
// Hold the final frame this long before the preview loops, so a completed win sequence reads before replay.
const TAIL_HOLD_MS = 1200;
// Refresh the cell glyph labels at this cadence (off the per-frame path; describe() allocates its snapshot).
const GLYPH_REFRESH_MS = 80;
// Throttle HUD pushes so a per-frame rollup value change does not thrash React.
const HUD_INTERVAL_MS = 100;
const HIGHLIGHT_COLOR = 0xffe066;

export interface SlotPreviewHud {
  readonly rollupValue: number | null;
  readonly escalation: EscalationTier | null;
  readonly flowState: string | null;
  readonly lastVfx: string | null;
}

const EMPTY_HUD: SlotPreviewHud = {
  rollupValue: null,
  escalation: null,
  flowState: null,
  lastVfx: null,
};

export interface SlotPreviewCallbacks {
  readonly onTimeline?: (timeline: PresentationTimeline) => void;
  readonly onTransport: (transport: PreviewTransport) => void;
  readonly onScenario: (scenario: SlotPreviewScenarioId) => void;
  readonly onHud: (hud: SlotPreviewHud) => void;
  readonly onNotice: (message: string | null) => void;
}

export interface SlotPreviewHandle {
  setRecordedScenario: (result: SpinResult | null) => void;
  setSeed: (seed: number) => void;
  setScenario: (scenario: SlotPreviewScenarioId) => void;
  resyncFromDocument: () => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  restart: () => void;
  cycleBackground: () => void;
  setBackground: (background: PreviewBackground) => void;
  destroy: () => void;
}

export function mountSlotPreview(
  host: HTMLElement,
  callbacks: SlotPreviewCallbacks,
): SlotPreviewHandle {
  let disposed = false;
  let stage: PreviewStage | null = null;

  let transport = makePreviewTransport();
  let scenarioId: SlotPreviewScenarioId = DEFAULT_SLOT_PREVIEW_SCENARIO;

  let slotView: SlotSceneView | null = null;
  let input: SlotPreviewInput | null = null;
  let simulation: SlotPreviewSimulation | null = null;
  let particleView: ParticleLayerView | null = null;
  let cinematicView: SkeletonView | null = null;
  let cinematic: { animation: string; startMs: number } | null = null;
  let recorded: SpinResult | null = null;
  let seed = 1;
  const detachAtlas = atlasTextureStore.subscribe(() => rebuildSafely());
  const detachEffects = effectsTextureStore.subscribe(() =>
    particleView?.setTextureResolver(effectsTextureStore.getResolver()),
  );
  let glyphLayer: Container | null = null;
  let glyphs: Text[] = []; // row-major, one per cell
  let metrics: GridMetrics | null = null;
  let durationMs = 0;
  // The (rows,cols) signature of the mounted SlotSceneView; a scene resize that changes it forces a rebuild
  // (the view fixes its grid at construction). Content-only edits re-sequence without a rebuild.
  let builtSceneHash: string | null = null;

  let hud: SlotPreviewHud = EMPTY_HUD;
  let lastFitW = -1;
  let lastFitH = -1;
  let glyphAccumMs = 0;
  let hudAccumMs = 0;
  let hudDirty = false;

  const glyphStyle = new TextStyle({ fill: '#f4f4f4', fontSize: 16, fontWeight: '600' });

  const notifyTransport = (): void => callbacks.onTransport(transport);

  const setHud = (patch: Partial<SlotPreviewHud>): void => {
    hud = { ...hud, ...patch };
    hudDirty = true;
  };

  const sceneCallbacks: SlotSceneCallbacks = {
    onRollup: (value) => setHud({ rollupValue: value }),
    onEscalation: (tier) => setHud({ escalation: tier }),
    onFlowEnter: (state, atMs) => {
      setHud({ flowState: state });
      const animation = input?.scene.featureFlows.states[state]?.cinematic?.animation;
      cinematic =
        animation && input?.skeleton?.animations[animation] ? { animation, startMs: atMs } : null;
      if (!cinematic) cinematicView?.clear();
    },
    onFlowExit: () => {
      setHud({ flowState: null });
      cinematic = null;
      cinematicView?.clear();
    },
    onVfxBurst: (preset) => setHud({ lastVfx: preset }),
    onMultiplierOrb: (valueX) => setHud({ lastVfx: `x${valueX}` }),
  };

  const teardownScene = (): void => {
    particleView?.destroy();
    particleView = null;
    cinematicView?.destroy();
    cinematicView = null;
    cinematic = null;
    simulation = null;
    input = null;
    if (slotView !== null) {
      stage?.content.removeChild(slotView.root);
      slotView.destroy();
      slotView = null;
    }
    if (glyphLayer !== null) {
      stage?.content.removeChild(glyphLayer);
      glyphLayer.destroy({ children: true });
      glyphLayer = null;
    }
    glyphs = [];
    metrics = null;
  };

  // Rebuild the SlotSceneView, glyph overlay, and timeline for the current scenario against the live scene.
  // Outside the per-frame path (a scenario or grid change); the steady path is the runtime-web advance.
  const rebuild = (): void => {
    if (stage === null) return;
    teardownScene();

    input = prepareSlotPreview(documentHost.current(), scenarioId, recorded);
    const { scene, hash, timeline } = input;
    const grid: GridConfig = scene.grid;
    simulation = createSlotPreviewSimulation(input.effects, timeline, grid, seed);

    const view = new SlotSceneView(grid, {
      tumble: scene.tumble,
      symbolResolver: (symbol) =>
        input?.skeleton && input.resolved.has(symbol)
          ? {
              document: input.skeleton,
              animSet: input.scene.symbols[symbol]!,
              textureResolver: atlasTextureStore.getResolver(),
              fitToCell: true,
            }
          : null,
      callbacks: sceneCallbacks,
      highlightColor: HIGHLIGHT_COLOR,
    });
    stage.content.addChild(view.root);

    const layer = new Container();
    stage.content.addChild(layer);
    const gm = gridMetrics(grid);
    const cellGlyphs: Text[] = [];
    for (let row = 0; row < grid.rows; row += 1) {
      for (let col = 0; col < grid.cols; col += 1) {
        const text = new Text({ text: '', style: glyphStyle });
        text.anchor.set(0.5);
        const center = cellCenter(gm, row, col);
        text.position.set(center.x, center.y);
        text.visible = false;
        layer.addChild(text);
        cellGlyphs.push(text);
      }
    }

    view.setTimeline(timeline);
    callbacks.onTimeline?.(timeline);
    cinematicView = new SkeletonView();
    cinematicView.setBoneChromeVisible(false);
    cinematicView.setTextureResolver(atlasTextureStore.getResolver());
    stage.content.addChild(cinematicView.root);
    particleView = new ParticleLayerView(effectsTextureStore.getResolver());
    const size = gridSize(gm);
    particleView.setViewport(size.width, size.height);
    stage.content.addChild(particleView.root);

    slotView = view;
    glyphLayer = layer;
    glyphs = cellGlyphs;
    metrics = gm;
    durationMs = timeline.durationMs;
    builtSceneHash = hash;

    hud = EMPTY_HUD;
    callbacks.onHud(hud);
    transport = restartPreview(transport);
    lastFitW = -1; // force a refit for the new board size
    view.update(0);
    refreshGlyphs();
    callbacks.onNotice(input.notices.length ? input.notices.join('\n') : null);
    notifyTransport();
  };

  // Update the cell glyph labels from the SlotSceneView's board snapshot. Off the per-frame path (throttled),
  // since describe() allocates its snapshot; a steady frame that does not cross a directive changes nothing.
  const refreshGlyphs = (): void => {
    if (slotView === null || metrics === null) return;
    const description = slotView.describe();
    for (let row = 0; row < description.rows; row += 1) {
      for (let col = 0; col < description.cols; col += 1) {
        const glyph = glyphs[row * description.cols + col];
        if (glyph === undefined) continue;
        const symbol = description.symbols[row]?.[col] ?? null;
        glyph.text = symbol ?? '';
        glyph.visible = symbol !== null && !input?.resolved.has(symbol);
      }
    }
  };

  const refit = (): void => {
    if (stage === null || metrics === null) return;
    const size = gridSize(metrics);
    const screen = stage.screenSize();
    stage.applyFit(fitSize(size.width, size.height, screen.width, screen.height, FIT_PADDING));
    lastFitW = screen.width;
    lastFitH = screen.height;
  };

  const tick = (ticker: Ticker): void => {
    if (stage === null || stage.isHidden()) return;

    stage.syncBackground(transport.background);

    const screen = stage.screenSize();
    if (screen.width !== lastFitW || screen.height !== lastFitH) refit();

    if (slotView === null || !transport.isPlaying) return;

    const priorTimeMs = simulation?.timeMs ?? 0;
    simulation?.step(ticker.deltaMS / 1000);
    transport = advancePreview(transport, Math.min(ticker.deltaMS, 250));
    const playhead = resolveSlotPlayhead(transport.elapsedMs, durationMs, TAIL_HOLD_MS);
    if (playhead.shouldRestart) {
      rebuildSafely();
      return;
    } else {
      const timeMs = simulation?.timeMs ?? playhead.timeMs;
      slotView.update(Math.min(timeMs, durationMs));
      if (particleView && simulation) particleView.update(simulation.system.readState());
      if (cinematicView && cinematic && input?.skeleton) {
        cinematicView.syncAnimatedLoop(
          input.skeleton,
          cinematic.animation,
          Math.max(0, timeMs - cinematic.startMs) / 1000,
          Math.max(0, timeMs - priorTimeMs) / 1000,
        );
        if (metrics) {
          const size = gridSize(metrics);
          const bounds = cinematicView.root.getLocalBounds();
          if (bounds.width > 0 && bounds.height > 0) {
            const scale = Math.min(size.width / bounds.width, size.height / bounds.height) * 0.8;
            cinematicView.root.scale.set(scale);
            cinematicView.root.position.set(
              size.width / 2 - (bounds.x + bounds.width / 2) * scale,
              size.height / 2 - (bounds.y + bounds.height / 2) * scale,
            );
          }
        }
      }
    }

    glyphAccumMs += ticker.deltaMS;
    if (glyphAccumMs >= GLYPH_REFRESH_MS) {
      glyphAccumMs = 0;
      refreshGlyphs();
    }

    hudAccumMs += ticker.deltaMS;
    if (hudDirty && hudAccumMs >= HUD_INTERVAL_MS) {
      hudAccumMs = 0;
      hudDirty = false;
      callbacks.onHud(hud);
    }
  };

  const rebuildSafely = (): void => {
    if (disposed) return;
    try {
      rebuild();
    } catch (error) {
      teardownScene();
      callbacks.onNotice(error instanceof Error ? error.message : 'Slot preview failed.');
    }
  };

  void (async () => {
    const created = await createPreviewStage(host, transport.background);
    if (disposed) {
      created.destroy();
      return;
    }
    stage = created;
    rebuildSafely();
    stage.app.ticker.add(tick);
  })().catch((error: unknown) => {
    if (!disposed)
      callbacks.onNotice(
        error instanceof Error ? error.message : 'Unable to initialize the preview.',
      );
  });

  return {
    setRecordedScenario(result: SpinResult | null): void {
      recorded = result;
      rebuildSafely();
    },
    setSeed(next: number): void {
      if (!Number.isInteger(next) || next < 0 || next > 0xffffffff) return;
      seed = next;
      rebuildSafely();
    },
    setScenario(next: SlotPreviewScenarioId): void {
      if (next === scenarioId && recorded === null) return;
      recorded = null;
      scenarioId = next;
      callbacks.onScenario(next);
      rebuildSafely();
    },
    resyncFromDocument(): void {
      if (stage === null) return;
      try {
        const next = prepareSlotPreview(documentHost.current(), scenarioId, recorded);
        if (next.hash !== builtSceneHash) rebuildSafely();
      } catch (error) {
        teardownScene();
        callbacks.onNotice(error instanceof Error ? error.message : 'Slot preview failed.');
      }
    },
    play(): void {
      transport = playPreview(transport);
      notifyTransport();
    },
    pause(): void {
      transport = pausePreview(transport);
      notifyTransport();
    },
    togglePlay(): void {
      transport = togglePreviewPlay(transport);
      notifyTransport();
    },
    restart(): void {
      rebuildSafely();
    },
    cycleBackground(): void {
      transport = cyclePreviewBackground(transport);
      notifyTransport();
    },
    setBackground(background: PreviewBackground): void {
      transport = setPreviewBackground(transport, background);
      notifyTransport();
    },
    destroy(): void {
      disposed = true;
      detachAtlas();
      detachEffects();
      teardownScene();
      glyphStyle.destroy();
      if (stage !== null) {
        stage.app.ticker.remove(tick);
        stage.destroy();
        stage = null;
      }
    },
  };
}
