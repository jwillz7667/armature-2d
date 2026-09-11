import { describe, expect, it } from 'vitest';
import { makeSpritePng } from '@marionette/atlas-pack/testing';
import { encodeProjectAsset, parseProjectDocument } from '@marionette/format';
import { symbolId } from '@marionette/format/slot';
import { MOCK_SCENARIOS } from '@marionette/math-bridge';
import {
  AddLayerCommand,
  AddRegionAttachmentCommand,
  CreateAnimationCommand,
  CreateBoneCommand,
  CreateEffectCommand,
  CreateSlotCommand,
  MapSymbolAnimSetCommand,
  SetAtlasRefCommand,
  SetEffectsAtlasCommand,
  SetFeatureFlowGraphCommand,
  SetGridConfigCommand,
  SetLayerFieldCommand,
  SetSceneRefsCommand,
  SetTumbleChoreographyCommand,
  SetWinSequencerCommand,
  SetEffectMetaCommand,
  createDocument,
  newDocState,
  makeIdFactory,
  exportDocument,
  exportEffects,
  exportProjectDocument,
  loadProjectDocument,
} from '@marionette/document-core';
import { parseRecordedScenario, prepareSlotPreview } from './slot-preview-input';
import { createSlotPreviewSimulation } from './slot-preview-simulation';

const env = { now: () => 0, createIds: makeIdFactory };
function authorScene() {
  const doc = createDocument(newDocState('Symbols'), env);
  const bone = doc.ids.mint('bone');
  doc.history.execute(
    new CreateBoneCommand(bone, null, {
      name: 'root',
      length: 8,
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      shearX: 0,
      shearY: 0,
      transformMode: 'normal',
    }),
  );
  const atlas = {
    pages: [
      {
        file: 'art.png',
        width: 8,
        height: 8,
        regions: [
          {
            name: 'art',
            x: 0,
            y: 0,
            w: 8,
            h: 8,
            rotated: false,
            offsetX: 0,
            offsetY: 0,
            originalW: 8,
            originalH: 8,
          },
        ],
      },
    ],
  };
  doc.history.execute(new SetAtlasRefCommand(atlas));
  doc.history.execute(new SetEffectsAtlasCommand(atlas));
  const slot = doc.ids.mint('slot');
  const color = { r: 1, g: 1, b: 1, a: 1 };
  doc.history.execute(
    new CreateSlotCommand(slot, {
      name: 'art',
      bone,
      color,
      darkColor: null,
      attachment: 'art',
      blendMode: 'normal',
    }),
  );
  doc.history.execute(
    new AddRegionAttachmentCommand(slot, {
      name: 'art',
      path: 'art',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      width: 8,
      height: 8,
      color,
    }),
  );
  for (const name of ['idle', 'land', 'win'])
    doc.history.execute(new CreateAnimationCommand(doc.ids.mint('animation'), name, 1));
  const skeleton = exportDocument(doc.model);
  const symbols = new Set(
    Object.values(MOCK_SCENARIOS).flatMap((scenario) => [
      ...scenario.result.grid.flat(),
      ...scenario.result.initialGrid.flat(),
    ]),
  );
  for (const id of symbols)
    doc.history.execute(
      new MapSymbolAnimSetCommand(symbolId(id), {
        animSet: {
          skeletonRef: skeleton.name,
          idle: 'idle',
          land: 'land',
          win: 'win',
          anticipation: 'win',
        },
        skeletonHash: skeleton.hash,
        skeletonAnimationNames: Object.keys(skeleton.animations),
      }),
    );
  doc.history.execute(
    new SetGridConfigCommand({
      ...doc.model.slotGrid(),
      cellWidth: 100,
      cellHeight: 100,
      reelStopStaggerMs: 40,
    }),
  );
  const create = new CreateEffectCommand({
    name: 'Spark',
    duration: 1,
    deterministic: true,
    simulationDt: 1 / 60,
    blendMode: 'additive',
  });
  doc.history.execute(create);
  const effectId = create.createdId!;
  const add = new AddLayerCommand(effectId, 'emitter', 'additive', 'art');
  doc.history.execute(add);
  const layer = doc.effects.getLayer(effectId, add.createdLayerId!)!;
  if (layer.body.type !== 'emitter') throw new Error('Expected emitter');
  doc.history.execute(
    new SetLayerFieldCommand(effectId, layer.id, 'spawn', {
      ...layer.body,
      spawn: { mode: 'burst', count: 8, atTime: 0 },
      lifetime: { min: 2, max: 3 },
    }),
  );
  doc.history.execute(
    new SetSceneRefsCommand({
      ...doc.model.slotScene().refs,
      vfxPresets: [{ name: 'Spark', hash: exportEffects(doc.effects).hash }],
    }),
  );
  doc.history.execute(
    new SetWinSequencerCommand({
      defaultSequence: 'base',
      thresholds: { big: 1, mega: 1e6, epic: 1e7 },
      sequences: {
        base: {
          steps: [
            { atMs: 200, target: { kind: 'allWinningCells' }, action: { kind: 'animateWin' } },
            {
              atMs: 350,
              target: { kind: 'allWinningCells' },
              action: { kind: 'vfx', preset: 'Spark', anchorRule: 'eachCell' },
            },
            {
              atMs: 400,
              target: { kind: 'allWinningCells' },
              action: { kind: 'rollupStart', curve: 'easeOutQuad' },
            },
            {
              atMs: 650,
              target: { kind: 'allWinningCells' },
              action: { kind: 'escalationBanner', tier: 'big' },
            },
          ],
        },
      },
    }),
  );
  doc.history.execute(
    new SetFeatureFlowGraphCommand({
      entry: 'base',
      states: { base: {}, freeSpins: { cinematic: { animation: 'win', vfxPreset: 'Spark' } } },
      transitions: [{ from: 'base', to: 'freeSpins', on: { type: 'freeSpinsAwarded' } }],
    }),
  );
  doc.history.execute(
    new SetTumbleChoreographyCommand({
      explodeMs: 100,
      dropMs: 200,
      dropEasing: 'easeOutQuad',
      refillStaggerMs: 30,
      settleMs: 50,
      stepGapMs: 70,
      rollupCurve: 'easeInOutCubic',
    }),
  );
  return { doc, effectId };
}

describe('slot composer workflow', () => {
  it('authors artwork bindings, win steps, flow, and tumble, then saves and reopens the complete project', () => {
    const { doc, effectId } = authorScene();
    const oldRefs = structuredClone(doc.model.slotScene().refs);
    doc.history.execute(new SetEffectMetaCommand(effectId, { duration: 1.5 }));
    const bytes = makeSpritePng({
      width: 8,
      height: 8,
      contentX: 0,
      contentY: 0,
      contentW: 8,
      contentH: 8,
    });
    const assets = [
      encodeProjectAsset('skeleton', 'art.png', bytes),
      encodeProjectAsset('effects', 'art.png', bytes),
    ];
    const project = parseProjectDocument(exportProjectDocument(doc, assets), {
      requireAssets: true,
    });
    expect(project.slotScene.refs.vfxPresets[0]!.hash).toBe(project.effects.hash);
    expect(doc.model.slotScene().refs).toEqual(oldRefs); // serialization does not edit history
    const reopened = loadProjectDocument(JSON.parse(JSON.stringify(project)), env);
    expect(exportProjectDocument(reopened, assets)).toEqual(project);
    for (const scenario of ['base-win', 'freespin-trigger', 'tumble-cascade'] as const) {
      const input = prepareSlotPreview(reopened, scenario);
      expect(input.notices).toEqual([]);
      expect(input.resolved.size).toBeGreaterThan(5);
      expect(input.timeline).toEqual(prepareSlotPreview(doc, scenario).timeline);
    }
    const base = prepareSlotPreview(reopened, 'base-win').timeline;
    expect(
      base.directives.find((event) => event.kind === 'escalation' && event.tier === 'big')?.atMs,
    ).toBe(650);
    expect(base.durationMs).toBe(1400); // the counter reaches its endpoint before playback completes
    const feature = prepareSlotPreview(reopened, 'freespin-trigger').timeline;
    expect(feature.directives).toContainEqual(
      expect.objectContaining({ kind: 'flowEnter', state: 'freeSpins' }),
    );
  });

  it('reproduces composed effect states across display frame rates and restarts without changing outcomes', () => {
    const { doc } = authorScene();
    const before = exportProjectDocument(doc);
    const input = prepareSlotPreview(doc, 'base-win');
    const run = (seed: number, frames: number) => {
      const sim = createSlotPreviewSimulation(
        input.effects,
        input.timeline,
        input.scene.grid,
        seed,
      );
      for (let i = 0; i < frames; i++) sim.step(1 / frames);
      return structuredClone(sim.system.readState());
    };
    const first = run(77, 60);
    expect(first.instances.length).toBeGreaterThan(0);
    expect(run(77, 30)).toEqual(first);
    expect(run(77, 60)).toEqual(first);
    expect(run(78, 60)).not.toEqual(first);
    expect(exportProjectDocument(doc)).toEqual(before);
  });

  it('validates recorded results against the authored grid and keeps them outside the project', () => {
    const { doc } = authorScene();
    const result = MOCK_SCENARIOS['base-win'].result;
    const recorded = parseRecordedScenario(result, 3, 5);
    expect(recorded.totalWin).toBe(result.totalWin);
    const before = exportProjectDocument(doc);
    expect(prepareSlotPreview(doc, 'base-win', recorded).timeline.spinId).toBe(result.spinId);
    expect(() => parseRecordedScenario(result, 4, 5)).toThrow();
    expect(() => parseRecordedScenario({ ...result, totalWin: Infinity }, 3, 5)).toThrow();
    expect(exportProjectDocument(doc)).toEqual(before);
  });
});
