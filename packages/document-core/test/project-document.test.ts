import { describe, expect, it } from 'vitest';
import {
  computeProjectContentHash,
  decodeProjectAsset,
  encodeProjectAsset,
  parseProjectDocument,
  ProjectValidationError,
} from '@marionette/format';
import {
  createDocument,
  exportProjectDocument,
  loadProjectDocument,
  newDocState,
  exportDocument,
  loadDocument,
} from '../src';
import { makeTestEnv, seeds } from './seeds';
import { effectsSeeds } from './effects-seeds';
import { loadDocumentWithEffects } from '../src';
import { computeSlotSceneHash } from '@marionette/format/slot';

describe('editable project persistence', () => {
  it('round trips an empty project without weakening runtime skeleton validation', () => {
    const original = createDocument(newDocState('empty'), makeTestEnv().env);
    const project = exportProjectDocument(original);
    expect(project.skeleton.bones).toEqual([]);
    expect(
      exportProjectDocument(
        loadProjectDocument(JSON.parse(JSON.stringify(project)), makeTestEnv().env),
      ),
    ).toEqual(project);
    expect(() => exportDocument(original.model)).toThrow();
  });

  it.each(Object.entries(seeds))('preserves all skeletal content in %s', (_name, seed) => {
    const project = exportProjectDocument(loadDocument(seed, makeTestEnv().env));
    expect(exportProjectDocument(loadProjectDocument(project, makeTestEnv().env))).toEqual(project);
  });

  it('preserves authored effects and slot scene values together', () => {
    const doc = loadDocumentWithEffects(seeds.animated, effectsSeeds.library, makeTestEnv().env);
    const original = exportProjectDocument(doc);
    const slotDraft = {
      ...original.slotScene,
      scene: {
        ...original.slotScene.scene,
        grid: { ...original.slotScene.scene.grid, cellWidth: 177 },
        tumble: { ...original.slotScene.scene.tumble, dropMs: 345 },
      },
    };
    const draft = {
      ...original,
      slotScene: { ...slotDraft, hash: computeSlotSceneHash(slotDraft) },
    };
    const authored = { ...draft, hash: computeProjectContentHash(draft) };
    const reloaded = exportProjectDocument(loadProjectDocument(authored, makeTestEnv().env));
    expect(Object.keys(reloaded.effects.effects).length).toBeGreaterThan(0);
    expect(reloaded).toEqual(authored);
  });

  it('rejects tampering, unknown project versions, and missing required pixels', () => {
    const project = exportProjectDocument(loadDocument(seeds.slotted, makeTestEnv().env));
    expect(() => parseProjectDocument({ ...project, name: 'tampered' })).toThrow(
      ProjectValidationError,
    );
    expect(() => parseProjectDocument({ ...project, projectFormatVersion: '99.0.0' })).toThrow(
      ProjectValidationError,
    );
    expect(() => parseProjectDocument(project, { requireAssets: true })).toThrow(
      /Missing skeleton texture/,
    );
  });

  it.each([0, 1, 2, 3, 1025])('preserves and verifies %i bytes', (length) => {
    const bytes = Uint8Array.from({ length }, (_, i) => i % 256);
    const asset = encodeProjectAsset('skeleton', 'texture.png', bytes);
    expect(decodeProjectAsset(asset)).toEqual(bytes);
    expect(() => decodeProjectAsset({ ...asset, hash: '0'.repeat(64) })).toThrow(/hash mismatch/);
  });

  it.each([
    '../escape.png',
    '/absolute.png',
    'C:/drive.png',
    'nested/../escape.png',
    'back\\slash.png',
  ])('rejects unsafe asset %s', (file) => {
    expect(() => encodeProjectAsset('skeleton', file, new Uint8Array())).toThrow();
  });
});
