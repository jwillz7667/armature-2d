import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { exportMediaToFile, cancelMediaExport } from './media-export';
import type { MediaExportOptions } from '../../shared';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  open: vi.fn(),
  run: vi.fn(),
  atomic: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
}));
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null },
  dialog: { showSaveDialog: mocks.save, showOpenDialog: mocks.open },
}));
vi.mock('./media-worker', () => ({ runMediaExportInWorker: mocks.run }));
vi.mock('../atomic-file', () => ({ atomicWriteFile: mocks.atomic }));
vi.mock('node:fs/promises', () => ({
  mkdir: mocks.mkdir,
  rename: mocks.rename,
  mkdtemp: vi.fn(),
  rm: vi.fn(),
}));
const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as WebContents;
const options: MediaExportOptions = {
  medium: 'gif',
  animation: null,
  fps: 30,
  width: 32,
  height: 32,
  background: null,
};
beforeEach(() => {
  vi.resetAllMocks();
});

describe('media cancellation around native dialogs and file commit', () => {
  it.each(['gif', 'png-sequence'] as const)(
    'cancels %s before touching a destination chosen after cancel',
    async (medium) => {
      const dialog = deferred<unknown>();
      mocks.save.mockReturnValue(dialog.promise);
      mocks.open.mockReturnValue(dialog.promise);
      const result = exportMediaToFile(sender, 'late-dialog', {}, [], { ...options, medium });
      expect(cancelMediaExport('late-dialog')).toEqual({ ok: true, data: { canceled: true } });
      dialog.resolve({
        canceled: false,
        filePath: '/chosen.gif',
        filePaths: ['/chosen-directory'],
      });
      expect(await result).toEqual({ ok: true, data: { status: 'canceled' } });
      expect(mocks.run).not.toHaveBeenCalled();
      expect(mocks.mkdir).not.toHaveBeenCalled();
      expect(mocks.atomic).not.toHaveBeenCalled();
    },
  );

  it('preserves the existing file when canceled while the replacement is being staged', async () => {
    mocks.save.mockResolvedValue({ canceled: false, filePath: '/chosen.gif' });
    mocks.run.mockResolvedValue({ kind: 'single', bytes: new Uint8Array([1]), frameCount: 1 });
    mocks.atomic.mockImplementation(
      async (_path, _data, commit: (from: string, to: string) => Promise<void>) => {
        expect(cancelMediaExport('staging')).toEqual({ ok: true, data: { canceled: true } });
        await commit('/temporary', '/chosen.gif');
      },
    );
    expect(await exportMediaToFile(sender, 'staging', {}, [], options)).toEqual({
      ok: true,
      data: { status: 'canceled' },
    });
    expect(mocks.rename).not.toHaveBeenCalled();
  });

  it('does not report a successful cancellation once atomic commit has begun', async () => {
    mocks.save.mockResolvedValue({ canceled: false, filePath: '/chosen.gif' });
    mocks.run.mockResolvedValue({ kind: 'single', bytes: new Uint8Array([1]), frameCount: 1 });
    mocks.atomic.mockImplementation(
      async (_path, _data, commit: (from: string, to: string) => Promise<void>) =>
        commit('/temporary', '/chosen.gif'),
    );
    mocks.rename.mockImplementation(async () => {
      expect(cancelMediaExport('committing')).toEqual({ ok: true, data: { canceled: false } });
    });
    expect(await exportMediaToFile(sender, 'committing', {}, [], options)).toEqual({
      ok: true,
      data: { status: 'saved', paths: ['/chosen.gif'], frameCount: 1 },
    });
    expect(cancelMediaExport('committing')).toEqual({ ok: true, data: { canceled: false } });
  });
});
