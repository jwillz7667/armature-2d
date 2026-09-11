import type { Ticker } from 'pixi.js';
import type { EffectSystem } from '@marionette/runtime-core';
import {
  createEffectPreviewSimulation,
  DEFAULT_EFFECT_PREVIEW_SEED,
  type EffectPreviewSimulation,
  type EffectPreviewMotion,
  type EffectPreviewTarget,
} from './preview-simulation';
import { ParticleLayerView } from '@marionette/runtime-web';
import { effectsTextureStore } from '../../editor-state/atlas-texture-store';
import { documentHost, exportEffects } from '../../document';
import { createPreviewStage, type PreviewStage } from '../preview/preview-stage';
import { fitBounds } from '../preview/preview-fit';
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

// The effects panel live GL preview (PP-D8 deliverable 1). It mounts a PixiJS preview that plays the
// CURRENTLY SELECTED effect through the SAME runtime-web rendering the packaged player uses: an
// EffectSystem (runtime-core solve) feeding a ParticleLayerView (runtime-web GL). There is no forked
// particle path: the emitter solve, the SoA->instance bridge, and the blend mapping all live in the shared
// packages; this module only wires them to a panel and a transport. The preview is strictly READ-ONLY over
// the document (LAW 2): it re-EXPORTS the effects library (exportEffects, a pure projection) and rebuilds
// its EffectSystem when the library changes, but never issues a command. Parameter edits flow through the
// existing effects commands in the panel; this view re-syncs from the resulting document revision.
//
// Lifecycle (mirrors viewport-panel-content): async Application init guarded against an unmount race, a
// ticker that throttles while the panel is hidden (a dockview inactive tab is 0x0), and a full destroy on
// unmount that releases the GL context and the particle pools. Re-syncs and restarts rebuild the system +
// view outside the per-frame hot path; the steady per-frame path is allocation-free (the runtime-web
// contract).

// The world box the preview frames. Emitters anchor at the origin and spray outward; a fixed symmetric box
// keeps the origin centered with a sensible zoom without a per-frame bounds scan (which would allocate).
const PREVIEW_WORLD_HALF = 260;
const FIT_PADDING = 16;
// A fixed deterministic trigger seed: a deterministic effect replays identically, an ambient one ignores it.
// Clamp a stalled frame so a long GC pause cannot explode the particle sim in one step.
const MAX_FRAME_DT = 1 / 20;
// Throttle stats pushes to the panel so a per-frame count change does not thrash React.
const STATS_INTERVAL_MS = 250;

export interface EffectPreviewStats {
  readonly liveInstances: number;
  readonly liveParticles: number;
}

export interface EffectPreviewCallbacks {
  // Reports transport state (play/pause/background) for the panel toolbar; fired on discrete commands only.
  readonly onTransport: (transport: PreviewTransport) => void;
  // A transient notice (an export/validation failure), or null to clear it.
  readonly onNotice: (message: string | null) => void;
  // Live particle counts for an optional HUD; throttled.
  readonly onStats: (stats: EffectPreviewStats) => void;
}

export interface EffectPreviewHandle {
  // Set which effect (by name) the preview plays; null clears it. Rebuilds the system on a real change.
  setEffectName: (name: string | null) => void;
  setBundleName: (name: string | null) => void;
  setSeed: (seed: number) => void;
  setMotion: (motion: EffectPreviewMotion) => void;
  // Re-export the effects library and rebuild if its content changed (called on document revision changes).
  resyncFromDocument: () => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  restart: () => void;
  cycleBackground: () => void;
  setBackground: (background: PreviewBackground) => void;
  destroy: () => void;
}

export function mountEffectPreview(
  host: HTMLElement,
  callbacks: EffectPreviewCallbacks,
): EffectPreviewHandle {
  let disposed = false;
  let stage: PreviewStage | null = null;

  let transport = makePreviewTransport();
  let effectName: string | null = null;
  let bundleName: string | null = null;
  let seed = DEFAULT_EFFECT_PREVIEW_SEED;
  let motion: EffectPreviewMotion = 'still';
  let simulation: EffectPreviewSimulation | null = null;
  let loopable = false;
  const target = (): EffectPreviewTarget | null =>
    bundleName !== null
      ? { kind: 'bundle', name: bundleName }
      : effectName !== null
        ? { kind: 'effect', name: effectName }
        : null;
  const targetKey = () =>
    bundleName !== null
      ? `bundle:${bundleName}`
      : effectName !== null
        ? `effect:${effectName}`
        : null;

  let system: EffectSystem | null = null;
  let particleView: ParticleLayerView | null = null;
  const detachTextures = effectsTextureStore.subscribe(() =>
    particleView?.setTextureResolver(effectsTextureStore.getResolver()),
  );
  // The content hash of the effects library the current system was built from; skips a rebuild when an
  // unrelated (skeleton) edit bumps the document revision but the effects library is byte-identical.
  let builtHash: string | null = null;
  let builtName: string | null = null;

  let lastFitW = -1;
  let lastFitH = -1;
  let statsAccumMs = 0;

  const notifyTransport = (): void => callbacks.onTransport(transport);

  // Build (or rebuild) the EffectSystem + ParticleLayerView from the live effects library and trigger the
  // selected effect. Fully replaces the previous system/view (outside the per-frame path). A projection or
  // validation failure tears the preview down and surfaces the typed message (LAW 3, fail loud at the seam).
  const rebuild = (): void => {
    if (stage === null) return;
    teardownSystem();

    const selection = target();
    if (selection === null) {
      builtHash = null;
      builtName = null;
      callbacks.onNotice(null);
      return;
    }

    let doc;
    try {
      doc = exportEffects(documentHost.current().effects);
    } catch (error) {
      builtHash = null;
      builtName = null;
      callbacks.onNotice(
        error instanceof Error ? `Preview unavailable: ${error.message}` : 'Preview unavailable',
      );
      return;
    }

    try {
      simulation = createEffectPreviewSimulation(doc, selection, seed, motion);
    } catch (error) {
      callbacks.onNotice(error instanceof Error ? error.message : 'Preview unavailable');
      return;
    }
    const built = simulation.system;
    const view = new ParticleLayerView(effectsTextureStore.getResolver());
    stage.content.addChild(view.root);
    view.setViewport(PREVIEW_WORLD_HALF * 2, PREVIEW_WORLD_HALF * 2);
    loopable =
      selection.kind === 'effect'
        ? (doc.effects[selection.name]?.layers.length ?? 0) > 0
        : (doc.bundles[selection.name]?.items.length ?? 0) > 0;

    system = built;
    particleView = view;
    builtHash = doc.hash;
    builtName = targetKey();
    transport = restartPreview(transport);
    callbacks.onNotice(null);
    notifyTransport();
  };

  const teardownSystem = (): void => {
    if (particleView !== null) {
      stage?.content.removeChild(particleView.root);
      particleView.destroy();
      particleView = null;
    }
    system = null;
    simulation = null;
  };

  // Rebuild from rest on repeat/restart so previous particles and random-stream positions are discarded.
  const retrigger = (): void => rebuild();

  const tick = (ticker: Ticker): void => {
    if (stage === null || stage.isHidden()) return;

    stage.syncBackground(transport.background);

    const size = stage.screenSize();
    if (size.width !== lastFitW || size.height !== lastFitH) {
      stage.applyFit(
        fitBounds(
          {
            minX: -PREVIEW_WORLD_HALF,
            minY: -PREVIEW_WORLD_HALF,
            maxX: PREVIEW_WORLD_HALF,
            maxY: PREVIEW_WORLD_HALF,
          },
          size.width,
          size.height,
          FIT_PADDING,
        ),
      );
      lastFitW = size.width;
      lastFitH = size.height;
    }

    if (system !== null && particleView !== null && transport.isPlaying) {
      const dt = Math.min(MAX_FRAME_DT, ticker.deltaMS / 1000);
      simulation?.step(dt);
      particleView.update(system.readState());
      // Loop a finished one-shot so the preview keeps showing motion instead of freezing on an empty frame.
      const repeat = loopable && system.liveInstanceCount() === 0;
      transport = advancePreview(transport, ticker.deltaMS);

      statsAccumMs += ticker.deltaMS;
      if (statsAccumMs >= STATS_INTERVAL_MS) {
        statsAccumMs = 0;
        callbacks.onStats({
          liveInstances: system.liveInstanceCount(),
          liveParticles: system.liveParticleTotal(),
        });
      }
      if (repeat) retrigger();
    }
  };

  void (async () => {
    const created = await createPreviewStage(host, transport.background);
    if (disposed) {
      created.destroy();
      return;
    }
    stage = created;
    rebuild();
    stage.app.ticker.add(tick);
  })().catch((error: unknown) =>
    callbacks.onNotice(error instanceof Error ? error.message : 'Preview initialization failed'),
  );

  return {
    setEffectName(name: string | null): void {
      if (name === effectName && bundleName === null) return;
      effectName = name;
      bundleName = null;
      rebuild();
    },
    setBundleName(name: string | null): void {
      if (name === bundleName && effectName === null) return;
      bundleName = name;
      effectName = null;
      rebuild();
    },
    setSeed(value: number): void {
      if (value === seed) return;
      if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
        throw new Error('Seed must be an unsigned 32-bit integer.');
      seed = value;
      rebuild();
    },
    setMotion(value: EffectPreviewMotion): void {
      if (value === motion) return;
      motion = value;
      rebuild();
    },
    resyncFromDocument(): void {
      if (stage === null) return;
      // Cheap gate: if the effects library projects to the same content hash and the same target effect,
      // nothing about the preview changed, so keep the running sim.
      let doc;
      try {
        doc = exportEffects(documentHost.current().effects);
      } catch {
        // A now-invalid library (e.g. an unresolvable region) means the current preview is stale: rebuild,
        // which surfaces the typed notice.
        rebuild();
        return;
      }
      if (doc.hash === builtHash && targetKey() === builtName) return;
      rebuild();
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
      transport = restartPreview(transport);
      retrigger();
      notifyTransport();
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
      detachTextures();
      teardownSystem();
      if (stage !== null) {
        stage.app.ticker.remove(tick);
        stage.destroy();
        stage = null;
      }
    },
  };
}
