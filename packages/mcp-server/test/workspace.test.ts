import { mkdtemp, rm, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeSpritePng } from '@marionette/atlas-pack/testing';
import { TOOLS, SessionRegistry, createNodeFileStore, type ToolDeps } from '../src';
let root: string;
let deps: ToolDeps;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'armature-assets-'));
  deps = { sessions: new SessionRegistry(), files: createNodeFileStore(root) };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const call = (name: string, input: unknown) =>
  TOOLS.find((t) => t.name === name)!.handler(deps, input);
describe('private workspace transfers', () => {
  it('uploads, lists, downloads and deletes a PNG byte-for-byte', async () => {
    const png = makeSpritePng({ width: 4, height: 4, rgba: [255, 0, 0, 255] });
    const base64 = Buffer.from(png).toString('base64');
    await call('workspace.upload', { filename: 'sprite.png', base64 });
    expect(await call('workspace.list', {})).toEqual({ files: ['sprite.png'] });
    expect(await call('workspace.download', { path: 'sprite.png' })).toEqual({
      path: 'sprite.png',
      base64,
      bytes: png.length,
    });
    await expect(call('workspace.deleteFile', { path: 'sprite.png' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(await call('workspace.deleteFile', { path: 'sprite.png', confirmDelete: true })).toEqual(
      { deleted: true, path: 'sprite.png' },
    );
    expect(await call('workspace.list', {})).toEqual({ files: [] });
  });
  it('rejects malformed and oversized uploads without replacing existing files', async () => {
    await call('workspace.upload', {
      filename: 'data.json',
      base64: Buffer.from('{}').toString('base64'),
    });
    for (const input of [
      { filename: '../data.json', base64: 'e30=' },
      { filename: 'data.json', base64: Buffer.from('not json').toString('base64') },
      { filename: 'data.json', base64: Buffer.alloc(512 * 1024 + 1).toString('base64') },
      { filename: 'bad.png', base64: Buffer.alloc(33).toString('base64') },
      { filename: 'data.json', base64: 'e31=' },
    ])
      await expect(call('workspace.upload', input)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    expect(await readFile(join(root, 'data.json'), 'utf8')).toBe('{}');
  });
  it('cannot read or delete another directory or a linked file', async () => {
    await expect(call('workspace.download', { path: '../outside' })).rejects.toMatchObject({
      code: 'PATH_FORBIDDEN',
    });
    await expect(
      call('workspace.deleteFile', { path: '../outside', confirmDelete: true }),
    ).rejects.toMatchObject({ code: 'PATH_FORBIDDEN' });
    if (process.platform !== 'win32') {
      await deps.files.write('original.json', '{}');
      await symlink(join(root, 'original.json'), join(root, 'linked.json'));
      await expect(
        call('workspace.deleteFile', { path: 'linked.json', confirmDelete: true }),
      ).rejects.toMatchObject({ code: 'PATH_FORBIDDEN' });
      expect(await deps.files.read('original.json')).toBe('{}');
    }
  });
});
