import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import {
  createNodeFileStore,
  emitAtlas,
  importSprites,
  packAtlas,
  trimSprite,
} from '../../../packages/atlas-pack/src/index';
const root = process.env.ARMATURE_PILOT_DIR;
if (!root) throw new Error('Set ARMATURE_PILOT_DIR');
const require = createRequire(import.meta.url);
const modules =
  process.env.ARMATURE_PILOT_NODE_MODULES ?? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const sharp = require(modules ? join(modules, 'sharp') : 'sharp');
// Normalize the large Pillow-encoded background through the same PNG writer
// used by the character atlas, for the native pngjs decoder.
const rainbow = join(root, 'source-layers/scene/background-rainbow.png');
await sharp(rainbow)
  .png()
  .toFile(rainbow + '.normalized.png');
renameSync(rainbow + '.normalized.png', rainbow);
const files = createNodeFileStore();
const sprites = await importSprites(join(root, 'source-layers/scene'), files);
const trimmed = sprites.map((s) => ({ name: s.name, ...trimSprite(s.rgba, s.width, s.height) }));
const packed = packAtlas(trimmed, { maxPageSize: 4096, padding: 3 });
const dir = join(root, 'atlas/scene');
mkdirSync(dir, { recursive: true });
const atlas = await emitAtlas(packed.atlas, packed.pageBitmaps, dir, files);
for (const page of atlas.pages) page.file = `atlas/scene/${page.file}`;
const all = JSON.parse(readFileSync(join(root, 'atlas.json'), 'utf8'));
all.pages.push(...atlas.pages);
writeFileSync(join(root, 'all-atlas.json'), JSON.stringify(all, null, 2) + '\n');
writeFileSync(
  join(root, 'scene-assets.json'),
  JSON.stringify(
    Object.fromEntries(sprites.map((s) => [s.name, { width: s.width, height: s.height }])),
    null,
    2,
  ) + '\n',
);
console.log(`Prepared ${sprites.length} scene assets on ${atlas.pages.length} native atlas pages`);
