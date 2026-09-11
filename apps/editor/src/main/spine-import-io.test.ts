import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { decodePng, encodePng } from '@marionette/atlas-pack';
import { parseDocument } from '@marionette/format';
import { importSpineWithAssets } from './spine-import-io';
import { buildSpineAtlas, parseSpineAtlas } from './spine-atlas';
import { withImportFiles } from './import-files';
import { importPremadeAtlasFromDescriptor } from './atlas-premade-io';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function directory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'armature-spine-'));
  roots.push(root);
  return root;
}
const source = {
  skeleton: { spine: '4.1.24' },
  bones: [{ name: 'root' }],
  slots: [{ name: 'slot', bone: 'root', attachment: 'art' }],
  skins: [{ name: 'default', attachments: { slot: { art: { width: 2, height: 3 } } } }],
};
const colors = [10, 20, 30, 40, 50, 60];
const rgba = Uint8Array.from(colors.flatMap((red) => [red, 0, 0, 255]));

describe('Spine atlas transaction', () => {
  it.each([0, 90, 180, 270])(
    'normalizes %i degree rotation and bottom whitespace into exact upright pixels',
    (rotation) => {
      const w = 2,
        h = 3;
      const width = rotation % 180 ? h : w,
        height = rotation % 180 ? w : h;
      const page = new Uint8Array(rgba.length);
      for (let y = 0; y < h; y += 1)
        for (let x = 0; x < w; x += 1) {
          const sx =
            rotation === 90 ? y : rotation === 180 ? w - 1 - x : rotation === 270 ? h - 1 - y : x;
          const sy =
            rotation === 90 ? w - 1 - x : rotation === 180 ? h - 1 - y : rotation === 270 ? x : y;
          page.set(rgba.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (sy * width + sx) * 4);
        }
      const parsed = parseSpineAtlas(
        `page.png\nsize: ${width},${height}\nart\nbounds: 0,0,2,3\nrotate: ${rotation}\noffsets: 1,2,4,6\n`,
      );
      const result = buildSpineAtlas(
        parsed,
        new Map([['page.png', encodePng({ width, height, rgba: page })]]),
      );
      const region = result.atlas.pages[0]!.regions[0]!;
      expect(region).toMatchObject({
        name: 'art',
        w: 2,
        h: 3,
        offsetX: 1,
        offsetY: 1,
        originalW: 4,
        originalH: 6,
        rotated: false,
      });
      const decoded = decodePng(result.pages[0]!.data);
      const reds: number[] = [];
      for (let y = 0; y < h; y += 1)
        for (let x = 0; x < w; x += 1)
          reds.push(decoded.rgba[((region.y + y) * decoded.width + region.x + x) * 4]!);
      expect(reds).toEqual(colors);
    },
  );

  it('imports a sibling atlas and PNG as a complete hashed document and reports missing pages as failures', async () => {
    const root = await directory();
    const path = join(root, 'hero.json');
    await writeFile(path, JSON.stringify(source));
    await writeFile(join(root, 'hero.atlas'), 'page.png\nsize: 2,3\nart\nbounds: 0,0,2,3\n');
    await writeFile(join(root, 'page.png'), encodePng({ width: 2, height: 3, rgba }));
    const result = await importSpineWithAssets(path);
    expect(result.status).toBe('imported');
    if (result.status !== 'imported') return;
    const document = parseDocument(result.document);
    expect(document.atlas.pages[0]?.width).toBeGreaterThan(0);
    expect(result.pages?.map((p) => p.file)).toEqual(document.atlas.pages.map((p) => p.file));
    expect(result.warnings).toEqual([]);
    const atlasOnly = await importPremadeAtlasFromDescriptor(join(root, 'hero.atlas'));
    expect(atlasOnly.ok).toBe(true);
    if (atlasOnly.ok && atlasOnly.data.status === 'imported')
      expect(atlasOnly.data.pages).toEqual(result.pages);
    await rm(join(root, 'page.png'));
    await expect(importSpineWithAssets(path)).rejects.toThrow();
  });

  it('reports missing descriptors instead of silently promising textured imports', async () => {
    const root = await directory();
    const path = join(root, 'hero.json');
    await writeFile(path, JSON.stringify(source));
    const result = await importSpineWithAssets(path);
    expect(result).toMatchObject({
      status: 'imported',
      pages: [],
      warnings: [
        expect.objectContaining({
          feature: 'atlas-synthesized',
          why: expect.stringContaining('artwork will be missing'),
        }),
      ],
    });
  });

  it('rejects traversal, symlink pages, oversized files, and malformed atlas regions', async () => {
    const root = await directory();
    await writeFile(join(root, 'real.png'), encodePng({ width: 2, height: 3, rgba }));
    await symlink(join(root, 'real.png'), join(root, 'linked.png'));
    await withImportFiles(join(root, 'hero.json'), async (files) => {
      await expect(files.read('../secret.png', 100)).rejects.toThrow('sibling');
      await expect(files.read('..\\secret.png', 100)).rejects.toThrow('sibling');
      await expect(files.read('linked.png', 1000)).rejects.toThrow();
      await expect(files.read('real.png', 1)).rejects.toThrow('resource budget');
    });
    expect(() => parseSpineAtlas('page.png\nart\nbounds: 0,0,-2,3')).toThrow('rectangle');
    expect(() => parseSpineAtlas('page.png\nart\nbounds: 0,0,2,3\nrotate: 45')).toThrow(
      'quarter-turn',
    );
    expect(() => parseSpineAtlas('page.png\nart\nbounds: 0,0,2,3\nart\nbounds: 0,0,2,3')).toThrow(
      'duplicate region',
    );
  });
});
