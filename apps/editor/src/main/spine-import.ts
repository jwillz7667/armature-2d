import { Worker } from 'node:worker_threads';
import { BrowserWindow, dialog } from 'electron';
import { spineImportResponseSchema, type IpcResult, type SpineImportResponse } from '../shared';

const SPINE_FILTERS = [{ name: 'Spine Project', extensions: ['json', 'skel'] }];
let busy = false;

function runImportWorker(path: string): Promise<SpineImportResponse> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./spine-import-worker.js', import.meta.url), {
      workerData: path,
      resourceLimits: { maxOldGenerationSizeMb: 768 },
    });
    let settled = false;
    const finish = (response?: SpineImportResponse, error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error);
      else if (response) resolve(response);
      else reject(new Error('Spine import worker produced no result'));
    };
    const timer = setTimeout(
      () =>
        finish(
          undefined,
          new Error('Spine import exceeded 60 seconds. Reduce the source project size.'),
        ),
      60000,
    );
    worker.on('message', (value: unknown) => {
      const result = spineImportResponseSchema.safeParse(value);
      if (result.success) finish(result.data);
      else finish(undefined, new Error('Invalid Spine import worker response'));
    });
    worker.on('error', (error) => finish(undefined, error));
    worker.on('exit', () => finish());
  });
}

export async function importSpineProjectFromFile(): Promise<IpcResult<SpineImportResponse>> {
  if (busy)
    return {
      ok: false,
      error: { code: 'IPC_HANDLER_ERROR', message: 'A Spine import is already running' },
    };
  busy = true;
  try {
    const focused = BrowserWindow.getFocusedWindow();
    const openOptions = {
      title: 'Import Spine Project',
      properties: ['openFile' as const],
      filters: SPINE_FILTERS,
    };
    const result = focused
      ? await dialog.showOpenDialog(focused, openOptions)
      : await dialog.showOpenDialog(openOptions);
    const path = result.filePaths[0];
    if (result.canceled || !path) return { ok: true, data: { status: 'canceled' } };
    const data = await runImportWorker(path);
    if (data.status === 'imported' && data.warnings.length) {
      const options = {
        type: 'warning' as const,
        title: 'Review Spine import changes',
        message: `This import has ${data.warnings.length} conversion notice(s).`,
        detail:
          data.warnings
            .slice(0, 40)
            .map((w) => `${w.path || '(project)'}: ${w.why}`)
            .join('\n\n') +
          (data.warnings.length > 40
            ? '\n\nAdditional notices are available in the import report.'
            : ''),
        buttons: ['Cancel', 'Import with these changes'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      };
      const decision =
        focused && !focused.isDestroyed()
          ? await dialog.showMessageBox(focused, options)
          : await dialog.showMessageBox(options);
      if (decision.response !== 1) return { ok: true, data: { status: 'canceled' } };
    }
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'IPC_HANDLER_ERROR',
        message: error instanceof Error ? error.message : 'Spine import failed',
      },
    };
  } finally {
    busy = false;
  }
}
