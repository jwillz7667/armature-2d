import { parentPort, workerData } from 'node:worker_threads';
import { join } from 'node:path';
import { createNodeFileStore, runAtlasPipeline } from '@marionette/atlas-pack';

const port = parentPort;
if (!port || typeof workerData?.sourceDir !== 'string' || typeof workerData?.outputDir !== 'string')
  throw new Error('Invalid atlas worker request');
const store = createNodeFileStore();
void runAtlasPipeline({
  sourceDir: workerData.sourceDir,
  outputDir: workerData.outputDir,
  fileStore: store,
})
  .then(async (atlas) => {
    const pages = [];
    for (const page of atlas.pages)
      pages.push({
        file: page.file,
        data: await store.readBytes(join(workerData.outputDir, page.file)),
      });
    port.postMessage({ status: 'imported', atlas, pages });
    port.close();
  })
  .catch((error: unknown) => {
    port.postMessage({
      status: 'failed',
      message: error instanceof Error ? error.message : 'Atlas import failed',
    });
    port.close();
  });
