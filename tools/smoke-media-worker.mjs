import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';

const document = JSON.parse(
  await readFile(
    new URL('../packages/conformance/src/rigs/rig-blendmodes.json', import.meta.url),
    'utf8',
  ),
);
const animation = Object.keys(document.animations)[0] ?? null;
const url = new URL('../apps/editor/out/main/media-export-worker.js', import.meta.url);
for (const medium of ['png-sequence', 'gif', 'apng']) {
  const worker = new Worker(url, {
    workerData: {
      document,
      pages: [],
      options: {
        medium,
        animation,
        fps: 10,
        width: 32,
        height: 32,
        from: { frame: 0 },
        to: { frame: 3 },
        background: null,
      },
    },
  });
  let frames = 0;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(new Error('Media worker timed out'));
    }, 20000);
    worker.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    worker.on('message', (message) => {
      if (message.type === 'error') {
        clearTimeout(timeout);
        reject(new Error(message.message));
      }
      if (message.type === 'frame') {
        if (message.png[0] !== 137 || message.index !== frames) {
          clearTimeout(timeout);
          reject(new Error('Invalid PNG frame'));
          return;
        }
        ++frames;
        worker.postMessage('written');
      }
      if (message.type === 'done') {
        clearTimeout(timeout);
        if (
          message.result.frameCount !== 3 ||
          (medium === 'png-sequence' ? frames !== 3 : message.result.bytes.length === 0)
        )
          reject(new Error('Incomplete media output'));
        else resolve();
      }
    });
  });
  await worker.terminate();
  console.log(`Built media worker exported ${medium}: 3 frames.`);
}

// Termination must interrupt work even during the synchronous content-bounds/palette pass.
const busy = new Worker(url, {
  workerData: {
    document,
    pages: [],
    options: {
      medium: 'png-sequence',
      animation,
      fps: 120,
      width: 256,
      height: 256,
      to: { frame: 216000 },
      background: null,
    },
  },
});
await new Promise((resolve, reject) => {
  busy.once('online', resolve);
  busy.once('error', reject);
});
await busy.terminate();
console.log('Busy media worker terminates without waiting for rendering to finish.');
