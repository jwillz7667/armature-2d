import { parentPort, workerData } from 'node:worker_threads';
import { importSpineWithAssets } from './spine-import-io';

const port = parentPort;
if (!port || typeof workerData !== 'string') throw new Error('Invalid Spine import worker request');
void importSpineWithAssets(workerData).then(
  (response) => {
    port.postMessage(response);
    port.close();
  },
  (error: unknown) => {
    port.postMessage({
      status: 'failed',
      errors: [
        {
          code: 'SPINE_IMPORT_FAILED',
          path: '',
          message: error instanceof Error ? error.message : 'Import failed',
        },
      ],
      warnings: [],
    });
    port.close();
  },
);
