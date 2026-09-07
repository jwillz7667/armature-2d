import { parentPort, workerData } from 'node:worker_threads';
import { z } from 'zod';
import { atlasImportPageSchema, mediaExportOptionsSchema } from '../../shared';
import { runMediaExport } from './media-export-core';
import type { MediaWorkerInput, MediaWorkerMessage } from './media-worker-protocol';

const port = parentPort;
if (!port) throw new Error('Media worker requires a parent port');
const parsed = z
  .object({
    document: z.unknown(),
    pages: z.array(atlasImportPageSchema).max(4096),
    options: mediaExportOptionsSchema,
  })
  .strict()
  .parse(workerData);
const input: MediaWorkerInput = {
  document: parsed.document,
  pages: parsed.pages,
  options: parsed.options,
};
function send(message: MediaWorkerMessage, transfer: ArrayBuffer[] = []): void {
  port!.postMessage(message, transfer);
}
let acknowledge: (() => void) | null = null;
port.on('message', (message: unknown) => {
  if (message === 'written' && acknowledge) {
    const resolve = acknowledge;
    acknowledge = null;
    resolve();
  }
});
void runMediaExport({
  ...input,
  sink: {
    async writeFrame(index, png) {
      const owned = new Uint8Array(png);
      const written = new Promise<void>((resolve) => {
        acknowledge = resolve;
      });
      send({ type: 'frame', index, png: owned }, [owned.buffer]);
      await written;
    },
  },
  control: { onProgress: (completed, total) => send({ type: 'progress', completed, total }) },
})
  .then((result) => {
    if (result.kind === 'single') {
      const bytes = new Uint8Array(result.bytes);
      send({ type: 'done', result: { ...result, bytes } }, [bytes.buffer]);
    } else send({ type: 'done', result });
    port.close();
  })
  .catch((error: unknown) => {
    send({
      type: 'error',
      message: error instanceof Error ? error.message : 'Media export failed',
    });
    port.close();
  });
