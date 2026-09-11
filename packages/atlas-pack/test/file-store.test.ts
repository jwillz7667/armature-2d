import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNodeFileStore } from '../src/file-store';

describe('bounded atlas file reads', () => {
  it('rejects oversized sparse files before allocating the declared size', async () => {
    const root = await mkdtemp(join(tmpdir(), 'armature-atlas-read-'));
    try {
      const path = join(root, 'oversized.png');
      const file = await open(path, 'w');
      try {
        await file.truncate(256 * 1024 * 1024 + 1);
      } finally {
        await file.close();
      }
      await expect(createNodeFileStore().readBytes(path)).rejects.toMatchObject({
        code: 'ATLAS_RESOURCE_LIMIT',
      });
      await writeFile(path, new Uint8Array([1, 2, 3]));
      expect(await createNodeFileStore().readBytes(path)).toEqual(new Uint8Array([1, 2, 3]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
