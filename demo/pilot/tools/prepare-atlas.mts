import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  createNodeFileStore,
  emitAtlas,
  importSprites,
  packAtlas,
} from '../../../packages/atlas-pack/src/index';

const require = createRequire(import.meta.url);
const modules =
  process.env.ARMATURE_PILOT_NODE_MODULES ?? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const sharp = require(modules ? join(modules, 'sharp') : 'sharp');
const root = process.env.ARMATURE_PILOT_DIR;
if (!root) throw new Error('Set ARMATURE_PILOT_DIR');
const cast = JSON.parse(readFileSync(join(root, 'layered-svg/cast.layers.json'), 'utf8'));
const raster = join(root, 'source-layers/cast');
mkdirSync(raster, { recursive: true });
mkdirSync(join(root, 'qa'), { recursive: true });
for (const character of cast) {
  for (const part of character.parts) {
    const region = `${character.name.toLowerCase()}-${part.id}`;
    const width = 2 * (part.box[2] - part.box[0]);
    const height = 2 * (part.box[3] - part.box[1]);
    await sharp(join(root, part.svg), { density: 144 })
      .resize(width, height)
      .png()
      .toFile(join(raster, `${region}.png`));
    part.region = region;
  }
  await sharp(join(root, 'layered-svg', `${character.name}.svg`), { density: 144 })
    .resize({ height: 650 })
    .png()
    .toFile(join(root, 'qa', `${character.name}-assembled.png`));
}
execFileSync(process.env.ARMATURE_PILOT_PYTHON ?? 'python3', [
  fileURLToPath(new URL('./bleed-alpha.py', import.meta.url)),
  raster,
]);
const files = createNodeFileStore();
const sprites = await importSprites(raster, files);
// Mesh UVs cover the complete source part. Retain its transparent margin so
// region attachments and weighted meshes have exactly the same registration.
const trimmed = sprites.map((s) => ({
  name: s.name,
  trimmedW: s.width,
  trimmedH: s.height,
  originalW: s.width,
  originalH: s.height,
  offsetX: 0,
  offsetY: 0,
  pixels: s.rgba,
}));
const packed = packAtlas(trimmed, { maxPageSize: 4096, padding: 3, allowRotation: false });
const dir = join(root, 'atlas/cast');
mkdirSync(dir, { recursive: true });
const atlas = await emitAtlas(packed.atlas, packed.pageBitmaps, dir, files);
for (const page of atlas.pages) page.file = `atlas/cast/${page.file}`;
writeFileSync(join(root, 'atlas.json'), JSON.stringify(atlas, null, 2) + '\n');
writeFileSync(join(root, 'cast-assets.json'), JSON.stringify(cast, null, 2) + '\n');
console.log(`Prepared ${sprites.length} SVG parts on ${atlas.pages.length} atlas pages`);
