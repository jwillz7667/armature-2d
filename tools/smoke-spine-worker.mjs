import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

const root = await mkdtemp(join(tmpdir(), 'armature-spine-worker-'));
try {
  const path = join(root, 'hero.json');
  await writeFile(
    path,
    JSON.stringify({
      skeleton: { spine: '4.1.24' },
      bones: [{ name: 'root' }],
      slots: [{ name: 'body', bone: 'root', attachment: 'art' }],
      skins: [{ name: 'default', attachments: { body: { art: { width: 1, height: 1 } } } }],
    }),
  );
  await writeFile(join(root, 'hero.atlas'), 'page.png\nsize: 1,1\nart\nbounds: 0,0,1,1\n');
  // A fixed, original one-pixel PNG. No Spine runtime/editor assets are used.
  await writeFile(
    join(root, 'page.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
  const worker = new Worker(
    new URL('../apps/editor/out/main/spine-import-worker.js', import.meta.url),
    { workerData: path, resourceLimits: { maxOldGenerationSizeMb: 768 } },
  );
  try {
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Spine import worker timed out')), 20000);
      worker.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      worker.once('message', (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      worker.once('exit', (code) => {
        clearTimeout(timer);
        if (code) reject(new Error(`Spine import worker exited ${code}`));
      });
    });
    assert.equal(response.status, 'imported', JSON.stringify(response));
    assert.equal(response.pages.length, 1);
    assert.ok(response.pages[0].data.length > 0);
    assert.equal(response.pages[0].file, response.document.atlas.pages[0].file);
    assert.deepEqual(response.warnings, []);
    console.log('Built Spine worker imported a rig, sibling atlas, and PNG as one result.');
  } finally {
    await worker.terminate();
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
