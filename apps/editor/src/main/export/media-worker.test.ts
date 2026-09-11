import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runMediaExportInWorker } from './media-worker';
import { MediaExportAbortedError, type RunMediaExportParams } from './media-export-core';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const workers: FakeWorker[] = [];
class FakeWorker extends EventEmitter {
  terminate = vi.fn(async () => 0);
  postMessage = vi.fn();
  constructor() {
    super();
    workers.push(this);
  }
}
vi.mock('node:worker_threads', () => ({
  Worker: class {
    constructor() {
      return new FakeWorker();
    }
  },
}));
const params = (
  writeFrame: RunMediaExportParams['sink']['writeFrame'],
  signal?: AbortSignal,
): RunMediaExportParams => ({
  document: {},
  pages: [],
  options: {
    medium: 'png-sequence',
    animation: null,
    fps: 30,
    width: 32,
    height: 32,
    background: null,
  },
  sink: { writeFrame },
  control: signal ? { signal } : {},
});
beforeEach(() => {
  workers.length = 0;
});

describe('media worker lifecycle', () => {
  it('waits for active writes and termination before rejecting cancellation', async () => {
    const write = deferred<void>();
    const termination = deferred<number>();
    const controller = new AbortController();
    const result = runMediaExportInWorker(params(() => write.promise, controller.signal));
    const worker = workers[0]!;
    worker.terminate.mockImplementation(() => termination.promise);
    const settled = vi.fn();
    const observed = result.catch((error: unknown) => {
      settled();
      return error;
    });
    worker.emit('message', { type: 'frame', index: 0, png: new Uint8Array([1]) });
    controller.abort();
    termination.resolve(1);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    write.resolve();
    expect(await observed).toBeInstanceOf(MediaExportAbortedError);
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('drains a frame write when the worker crashes', async () => {
    const write = deferred<void>();
    const result = runMediaExportInWorker(params(() => write.promise));
    const observed = result.catch((error: unknown) => error);
    const worker = workers[0]!;
    worker.emit('message', { type: 'frame', index: 0, png: new Uint8Array([1]) });
    const failure = new Error('worker crashed');
    worker.emit('error', failure);
    write.resolve();
    expect(await observed).toBe(failure);
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('rejects sink failure without acknowledging the frame', async () => {
    const failure = new Error('disk full');
    const result = runMediaExportInWorker(params(() => Promise.reject(failure)));
    const worker = workers[0]!;
    worker.emit('message', { type: 'frame', index: 0, png: new Uint8Array([1]) });
    await expect(result).rejects.toBe(failure);
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates when a progress callback throws', async () => {
    const failure = new Error('progress failed');
    const input = params(async () => undefined);
    const result = runMediaExportInWorker({
      ...input,
      control: {
        onProgress: () => {
          throw failure;
        },
      },
    });
    workers[0]!.emit('message', { type: 'progress', completed: 1, total: 2 });
    await expect(result).rejects.toBe(failure);
  });
});
