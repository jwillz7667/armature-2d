import { mkdtemp, rm, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeSpritePng } from '@marionette/atlas-pack/testing';
import { TOOLS, SessionRegistry, createNodeFileStore, type ToolDeps } from '../src';
let root: string;
let deps: ToolDeps;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'armature-project-'));
  deps = { sessions: new SessionRegistry(), files: createNodeFileStore(root) };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const call = async (name: string, input: unknown) =>
  (await TOOLS.find((t) => t.name === name)!.handler(deps, input)) as Record<string, unknown>;
describe('complete project persistence', () => {
  it('round-trips an unfinished project with effects and a slot grid through a fresh registry', async () => {
    const { documentId } = await call('document.new', { name: 'Complete project' });
    await call('effect.create', { documentId, name: 'sparkles' });
    await call('slot.grid.preset', { documentId, preset: 'cluster7x7' });
    const expected = await call('project.export', { documentId });
    await call('project.save', { documentId, path: 'scene.armature.json' });
    deps = { ...deps, sessions: new SessionRegistry() };
    const reopened = await call('project.open', { path: 'scene.armature.json' });
    expect(await call('project.export', { documentId: reopened.documentId })).toEqual(expected);
    expect(await call('history.getState', { documentId: reopened.documentId })).toMatchObject({
      canUndo: false,
      canRedo: false,
    });
  });
  it('embeds texture bytes and renders the same image after the external texture is removed', async () => {
    const png = makeSpritePng({ width: 4, height: 4, rgba: [255, 0, 0, 255] });
    await deps.files.writeBinary('sprite.png', png);
    const { documentId } = await call('document.new', { name: 'Textured project' });
    const { boneId } = await call('bone.create', { documentId, name: 'root' });
    const { slotId } = await call('slot.create', { documentId, boneId, name: 'body' });
    await call('atlas.set', {
      documentId,
      atlas: {
        pages: [
          {
            file: 'sprite.png',
            width: 4,
            height: 4,
            regions: [
              {
                name: 'sprite',
                x: 0,
                y: 0,
                w: 4,
                h: 4,
                rotated: false,
                offsetX: 0,
                offsetY: 0,
                originalW: 4,
                originalH: 4,
              },
            ],
          },
        ],
      },
    });
    await call('attach.region.add', {
      documentId,
      slotId,
      name: 'sprite',
      path: 'sprite',
      width: 4,
      height: 4,
    });
    await call('slot.activeAttachment', { documentId, slotId, attachment: 'sprite' });
    const input = { documentId, width: 32, height: 32, fit: { x: -4, y: -4, w: 8, h: 8 } };
    const original = await call('render_frame', input);
    expect(original.placeholders).toBe(false);
    await call('project.save', { documentId, path: 'textured.armature.json' });
    await unlink(join(root, 'sprite.png'));
    deps = { ...deps, sessions: new SessionRegistry() };
    const opened = await call('project.open', { path: 'textured.armature.json' });
    expect(await call('render_frame', { ...input, documentId: opened.documentId })).toEqual(
      original,
    );
    const saved = JSON.parse(await readFile(join(root, 'textured.armature.json'), 'utf8'));
    expect((await call('project.export', { documentId: opened.documentId })).project).toEqual(
      saved,
    );
  });
  it('rejects tampered project hashes before opening a session', async () => {
    const { documentId } = await call('document.new', { name: 'Original' });
    await call('project.save', { documentId, path: 'scene.json' });
    const project = JSON.parse(await deps.files.read('scene.json'));
    project.name = 'Tampered';
    await deps.files.write('scene.json', JSON.stringify(project));
    const before = deps.sessions.size;
    await expect(call('project.open', { path: 'scene.json' })).rejects.toMatchObject({
      code: 'INVALID_PROJECT',
    });
    expect(deps.sessions.size).toBe(before);
  });
});
