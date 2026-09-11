import { Worker } from 'node:worker_threads';
import { BrowserWindow, dialog } from 'electron';
import { layeredImportResponseSchema, type IpcResult, type LayeredImportResponse } from '../shared';

let busy = false;
function runLayeredWorker(path: string): Promise<LayeredImportResponse> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./layered-import-worker.js', import.meta.url), {
      workerData: path,
      resourceLimits: { maxOldGenerationSizeMb: 768 },
    });
    let settled = false;
    const finish = (result?: LayeredImportResponse, error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (result) resolve(result);
      else reject(error ?? new Error('Layered import worker exited without a result'));
    };
    const timer = setTimeout(
      () =>
        finish(undefined, new Error('Layered import exceeded 60 seconds; reduce the source size')),
      60000,
    );
    worker.on('message', (value: unknown) => {
      const parsed = layeredImportResponseSchema.safeParse(value);
      if (parsed.success) finish(parsed.data);
      else finish(undefined, new Error('Invalid layered import worker response'));
    });
    worker.on('error', (error) => finish(undefined, error));
    worker.on('exit', () => finish());
  });
}

const LAYERED_FILTERS = [
  { name: 'Layered Image', extensions: ['psd', 'ora'] },
  { name: 'All Files', extensions: ['*'] },
];

export async function importLayeredFromFile(): Promise<IpcResult<LayeredImportResponse>> {
  if (busy)
    return {
      ok: false,
      error: { code: 'IPC_HANDLER_ERROR', message: 'A layered import is already running' },
    };
  busy = true;
  try {
    const openOptions = {
      title: 'Import Layered File',
      properties: ['openFile' as const],
      filters: LAYERED_FILTERS,
    };
    const focused = BrowserWindow.getFocusedWindow();
    const result = focused
      ? await dialog.showOpenDialog(focused, openOptions)
      : await dialog.showOpenDialog(openOptions);
    const path = result.filePaths[0];
    if (result.canceled || path === undefined) {
      return { ok: true, data: { status: 'canceled' } };
    }

    return { ok: true, data: await runLayeredWorker(path) };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'IPC_HANDLER_ERROR',
        message: error instanceof Error ? error.message : 'Layered import failed',
      },
    };
  } finally {
    busy = false;
  }
}
