import { Worker } from 'node:worker_threads';
import {
  MediaExportAbortedError,
  type MediaExportResult,
  type RunMediaExportParams,
} from './media-export-core';
import type { MediaWorkerMessage } from './media-worker-protocol';

// CPU rendering and synchronous GIF/APNG encoding run off the Electron event loop. At most one PNG
// frame crosses the bridge until its disk write is acknowledged; cancellation terminates even a busy
// global-palette/content-bounds pass, which cannot service a cooperative message while computing.
export function runMediaExportInWorker(params: RunMediaExportParams): Promise<MediaExportResult> {
  return new Promise((resolve, reject) => {
    const signal = params.control?.signal;
    if (signal?.aborted) {
      reject(new MediaExportAbortedError());
      return;
    }
    const worker = new Worker(new URL('./media-export-worker.js', import.meta.url), {
      workerData: { document: params.document, pages: params.pages, options: params.options },
      resourceLimits: { maxOldGenerationSizeMb: 768 },
    });
    let settled = false;
    const finish = (error: unknown, result?: MediaExportResult): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      void worker.terminate();
      if (error !== null) reject(error);
      else if (result) resolve(result);
      else reject(new Error('Media worker ended without a result'));
    };
    const abort = (): void => finish(new MediaExportAbortedError());
    signal?.addEventListener('abort', abort, { once: true });
    worker.on('message', (message: MediaWorkerMessage) => {
      if (settled) return;
      if (message.type === 'progress')
        params.control?.onProgress?.(message.completed, message.total);
      else if (message.type === 'done') finish(null, message.result);
      else if (message.type === 'error') finish(new Error(message.message));
      else
        void params.sink
          .writeFrame(message.index, message.png)
          .then(() => {
            if (!settled) worker.postMessage('written');
          })
          .catch((error: unknown) => finish(error));
    });
    worker.on('error', (error) => finish(error));
    worker.on('exit', (code) => {
      if (!settled) finish(new Error(`Media worker stopped before completion (${code})`));
    });
  });
}
