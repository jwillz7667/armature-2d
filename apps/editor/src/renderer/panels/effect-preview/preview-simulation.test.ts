import { describe, expect, it } from 'vitest';
import { makeSpritePng } from '@marionette/atlas-pack/testing';
import { decodeProjectAsset, encodeProjectAsset, parseProjectDocument } from '@marionette/format';
import {
  AddBundleItemCommand,
  AddLayerCommand,
  AddLifeStopCommand,
  CreateBundleCommand,
  CreateEffectCommand,
  SetEffectsAtlasCommand,
  SetEmitterTrailCommand,
  SetLayerFieldCommand,
  createDocument,
  exportEffects,
  exportProjectDocument,
  loadProjectDocument,
  makeIdFactory,
  newDocState,
} from '@marionette/document-core';
import { createEffectPreviewSimulation } from './preview-simulation';

const environment = { now: () => 0, createIds: makeIdFactory };

function author() {
  const doc = createDocument(newDocState('Celebration'), environment);
  doc.history.execute(
    new SetEffectsAtlasCommand({
      pages: [
        {
          file: 'spark.png',
          width: 8,
          height: 8,
          regions: [
            {
              name: 'spark',
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
    }),
  );
  const create = new CreateEffectCommand({
    name: 'Spark',
    duration: 2,
    deterministic: true,
    simulationDt: 1 / 60,
    blendMode: 'additive',
  });
  doc.history.execute(create);
  const effectId = create.createdId!;
  const add = new AddLayerCommand(effectId, 'emitter', 'additive', 'spark');
  doc.history.execute(add);
  const layerId = add.createdLayerId!;
  const layer = doc.effects.getLayer(effectId, layerId)!;
  if (layer.body.type !== 'emitter') throw new Error('Expected an emitter');
  doc.history.execute(
    new SetLayerFieldCommand(effectId, layerId, 'spawn', {
      ...layer.body,
      spawn: { mode: 'burst', count: 12, atTime: 0 },
      lifetime: { min: 2, max: 3 },
      startSpeed: { min: 20, max: 50 },
      gravity: { x: 0, y: -10 },
    }),
  );
  doc.history.execute(
    new AddLifeStopCommand(effectId, layerId, 'alphaOverLife', 0.4, 0.8, {
      type: 'bezier',
      cx1: 0.25,
      cy1: 0.1,
      cx2: 0.75,
      cy2: 0.9,
    }),
  );
  doc.history.execute(
    new SetEmitterTrailCommand(effectId, layerId, {
      region: 'spark',
      maxSegments: 12,
      segmentSpacing: 2,
    }),
  );
  const ribbon = new AddLayerCommand(effectId, 'ribbonTrail', 'normal', 'spark');
  doc.history.execute(ribbon);
  doc.history.execute(new CreateBundleCommand('Celebrate'));
  for (const [anchorRole, startOffset, seedSalt] of [
    ['left', 0, 1],
    ['right', 0.25, 2],
  ] as const)
    doc.history.execute(
      new AddBundleItemCommand('Celebrate', {
        effect: effectId,
        anchorRole,
        startOffset,
        seedSalt,
      }),
    );
  return doc;
}

describe('effects designer workflow', () => {
  it('preserves authored bodies, lifetime curves, trails, bundles, and pixels through save/reopen', () => {
    const doc = author();
    const bytes = makeSpritePng({
      width: 8,
      height: 8,
      contentX: 0,
      contentY: 0,
      contentW: 8,
      contentH: 8,
    });
    const project = exportProjectDocument(doc, [encodeProjectAsset('effects', 'spark.png', bytes)]);
    const parsed = parseProjectDocument(JSON.parse(JSON.stringify(project)), {
      requireAssets: true,
    });
    const reopened = loadProjectDocument(parsed, environment);
    expect(exportProjectDocument(reopened, parsed.assets)).toEqual(project);
    expect(decodeProjectAsset(parsed.assets[0]!)).toEqual(bytes);
    doc.history.undo();
    expect(doc.effects.getBundle('Celebrate')!.itemOrder).toHaveLength(1);
    doc.history.redo();
    expect(exportEffects(doc.effects)).toEqual(project.effects);
  });

  it('replays seeded moving-anchor bundles identically at 30 and 60 Hz and after restart', () => {
    const effects = exportEffects(author().effects);
    const target = { kind: 'bundle', name: 'Celebrate' } as const;
    const run = (seed: number, frames: number) => {
      const simulation = createEffectPreviewSimulation(effects, target, seed, 'circle');
      for (let i = 0; i < frames; i++) simulation.step(1 / frames);
      return structuredClone(simulation.system.readState());
    };
    const first = run(123, 60);
    expect(first.instances).toHaveLength(2);
    expect(first.instances.every((i) => i.emitters[0]!.liveCount === 12)).toBe(true);
    expect(
      first.instances[1]!.emitters[0]!.anchor[4] - first.instances[0]!.emitters[0]!.anchor[4],
    ).toBeCloseTo(200);
    expect(run(123, 30)).toEqual(first);
    expect(run(123, 60)).toEqual(first);
    expect(run(456, 60)).not.toEqual(first);
  });

  it('rejects invalid preview seeds and time inputs without advancing state', () => {
    const effects = exportEffects(author().effects);
    const target = { kind: 'effect', name: 'Spark' } as const;
    expect(() => createEffectPreviewSimulation(effects, target, -1, 'still')).toThrow(/seed/);
    const simulation = createEffectPreviewSimulation(effects, target, 1, 'still');
    const before = structuredClone(simulation.system.readState());
    expect(() => simulation.step(NaN)).toThrow(/delta/);
    expect(() => simulation.step(-1)).toThrow(/delta/);
    expect(simulation.system.readState()).toEqual(before);
  });
});
