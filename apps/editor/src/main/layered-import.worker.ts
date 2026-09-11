import { parentPort, workerData } from 'node:worker_threads';
import { basename, extname } from 'node:path';
import { withImportFiles } from './import-files';
import { projectLayeredFile } from './layered-project';

const port = parentPort;
if (!port || typeof workerData !== 'string') throw new Error('Invalid layered import request');
void withImportFiles(workerData, async (files) => {
  const name = basename(workerData);
  const bytes = await files.read(name, 256 * 1024 * 1024);
  return projectLayeredFile(
    bytes,
    basename(name, extname(name)),
    extname(name).toLowerCase() === '.ora' ? 'ora' : 'psd',
  );
}).then(
  (result) => {
    port.postMessage(result);
    port.close();
  },
  (error: unknown) => {
    port.postMessage({
      status: 'failed',
      errors: [
        {
          code: 'LAYERED_IMPORT_FAILED',
          path: '',
          message: error instanceof Error ? error.message : 'Layered import failed',
        },
      ],
      diagnostics: [],
    });
    port.close();
  },
);
