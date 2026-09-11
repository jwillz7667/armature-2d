import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  computeProjectContentHash,
  decodeProjectAsset,
  encodeProjectAsset,
  parseProjectDocument,
} from '@marionette/format';
import {
  exportProjectDocument,
  createDocument,
  newDocState,
  makeIdFactory,
} from '@marionette/document-core';
import { projectWithAssets, readProjectFile } from './file-io';

vi.mock('electron', () => ({ app: {}, BrowserWindow: {}, dialog: {} }));
const createInitialDocument = () =>
  createDocument(newDocState('test'), { now: () => 0, createIds: makeIdFactory });
const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});

describe('portable project file boundary', () => {
  it('persists both asset namespaces and returns validated members on open', async () => {
    const project = exportProjectDocument(createInitialDocument());
    const pixels = new Uint8Array([1, 2, 3, 254]);
    const packed = parseProjectDocument(
      projectWithAssets(project, [
        { file: 'same.png', data: pixels },
        { scope: 'effects', file: 'same.png', data: new Uint8Array([8, 9]) },
      ]),
    );
    const dir = await mkdtemp(join(tmpdir(), 'armature-project-'));
    directories.push(dir);
    const path = join(dir, 'project.armature.json');
    await writeFile(path, JSON.stringify(packed));
    const opened = await readProjectFile(path);
    expect(opened.pages).toEqual([
      { scope: 'skeleton', file: 'same.png', data: pixels },
      { scope: 'effects', file: 'same.png', data: new Uint8Array([8, 9]) },
    ]);
    expect(parseProjectDocument(opened.document).skeleton).toEqual(project.skeleton);
    expect(parseProjectDocument(opened.document).assets).toEqual([]);
    expect(await readFile(path, 'utf8')).toBe(JSON.stringify(packed));
  });
  it('rejects corrupted pixels even if the outer project hash was recomputed', () => {
    const original = exportProjectDocument(createInitialDocument());
    const asset = encodeProjectAsset('skeleton', 'texture.png', new Uint8Array([1, 2, 3]));
    const draft = { ...original, assets: [{ ...asset, data: 'AAAA' }] };
    expect(() =>
      parseProjectDocument({ ...draft, hash: computeProjectContentHash(draft) }),
    ).toThrow(/Asset hash mismatch/);
    expect(decodeProjectAsset(asset)).toEqual(new Uint8Array([1, 2, 3]));
  });
});
