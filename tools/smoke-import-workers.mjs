import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

const require = createRequire(new URL('../apps/editor/package.json', import.meta.url));
const { zipSync, strToU8 } = require('fflate');
const root = await mkdtemp(join(tmpdir(), 'armature-import-workers-'));
async function run(name, data) {
  const worker = new Worker(new URL(`../apps/editor/out/main/${name}.js`, import.meta.url), {
    workerData: data,
    resourceLimits: { maxOldGenerationSizeMb: 768 },
  });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${name} timed out`)), 20000);
      worker.once('message', (value) => {
        clearTimeout(timer);
        resolve(value);
      });
      worker.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      worker.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`${name} exited ${code} before a result`));
      });
    });
  } finally {
    await worker.terminate();
  }
}
try {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
    'base64',
  );
  const sourceDir = join(root, 'sprites');
  const outputDir = join(root, 'output');
  await mkdir(sourceDir);
  await mkdir(outputDir);
  await writeFile(join(sourceDir, 'art.png'), png);
  const atlas = await run('atlas-import-worker', { sourceDir, outputDir });
  assert.equal(atlas.status, 'imported', JSON.stringify(atlas));
  assert.equal(atlas.pages.length, 1);
  assert.ok(atlas.pages[0].data.length > 0);
  assert.equal(atlas.pages[0].file, atlas.atlas.pages[0].file);
  const oraPath = join(root, 'hero.ora');
  await writeFile(
    oraPath,
    zipSync({
      'stack.xml': strToU8(
        '<image w="1" h="1"><stack><layer name="art" src="art.png"/></stack></image>',
      ),
      'art.png': png,
    }),
  );
  const layered = await run('layered-import-worker', oraPath);
  assert.equal(layered.status, 'imported', JSON.stringify(layered));
  assert.equal(layered.pages.length, 1);
  assert.equal(layered.pages[0].file, layered.document.atlas.pages[0].file);
  const oversized = join(root, 'oversized.psd');
  const file = await open(oversized, 'w');
  try {
    await file.truncate(256 * 1024 * 1024 + 1);
  } finally {
    await file.close();
  }
  const rejected = await run('layered-import-worker', oversized);
  assert.equal(rejected.status, 'failed');
  assert.equal(rejected.errors[0].code, 'LAYERED_IMPORT_FAILED');
  await writeFile(join(sourceDir, 'art.png'), 'invalid PNG');
  const invalid = await run('atlas-import-worker', { sourceDir, outputDir });
  assert.equal(invalid.status, 'failed');
  assert.equal(invalid.code, 'ATLAS_DECODE_FAILED');
  console.log(
    'Built atlas/layered workers import original artwork, reject oversized/corrupt input, and exit cleanly.',
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
