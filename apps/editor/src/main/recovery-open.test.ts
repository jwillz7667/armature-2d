import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createDocument,
  exportProjectDocument,
  makeIdFactory,
  newDocState,
} from '@marionette/document-core';
import { recoveryOpenRequestSchema } from '../shared';

const native = vi.hoisted(() => ({ directory: '', message: vi.fn(), open: vi.fn() }));
vi.mock('electron', () => ({
  app: { getPath: () => native.directory },
  BrowserWindow: { getFocusedWindow: () => null },
  dialog: { showMessageBox: native.message, showOpenDialog: native.open },
}));
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  native.directory = await mkdtemp(join(tmpdir(), 'armature-recovery-test-'));
  await mkdir(join(native.directory, 'recovery'));
});
afterEach(async () => {
  await rm(native.directory, { recursive: true, force: true });
});
const recovery = (name = '00000000-0000-4000-8000-000000000001.armature.json') =>
  join(native.directory, 'recovery', name);

describe('startup recovery offer', () => {
  it('does not interrupt startup for an empty folder or linked copy', async () => {
    const { openRecovery } = await import('./file-io');
    const target = join(native.directory, 'external.json');
    await writeFile(target, '{}');
    await symlink(target, recovery());
    expect(await openRecovery(true)).toEqual({ ok: true, data: { status: 'canceled' } });
    expect(native.message).not.toHaveBeenCalled();
    expect(native.open).not.toHaveBeenCalled();
  });
  it('offers once per process and keeps copies when Later is selected', async () => {
    const { openRecovery } = await import('./file-io');
    await writeFile(recovery(), 'recovery bytes');
    native.message.mockResolvedValue({ response: 1 });
    expect(await openRecovery(true)).toEqual({ ok: true, data: { status: 'canceled' } });
    await openRecovery(true);
    expect(native.message).toHaveBeenCalledOnce();
    expect(native.open).not.toHaveBeenCalled();
    expect(await readFile(recovery(), 'utf8')).toBe('recovery bytes');
    native.open.mockResolvedValue({ canceled: true, filePaths: [] });
    await openRecovery();
    expect(native.open).toHaveBeenCalledOnce();
  });
  it('recovers a backup-only copy without deleting it or reusing its session id', async () => {
    const { openRecovery } = await import('./file-io');
    const project = exportProjectDocument(
      createDocument(newDocState('recovery'), { now: () => 0, createIds: makeIdFactory }),
    );
    const path = `${recovery()}.bak`;
    const bytes = JSON.stringify(project);
    await writeFile(path, bytes);
    native.message.mockResolvedValue({ response: 0 });
    native.open.mockResolvedValue({ canceled: false, filePaths: [path] });
    const result = await openRecovery(true);
    expect(result.ok).toBe(true);
    if (!result.ok || result.data.status !== 'opened') throw new Error('Recovery did not open');
    expect(result.data.documentId).not.toBe('00000000-0000-4000-8000-000000000001');
    expect(result.data.documentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await readFile(path, 'utf8')).toBe(bytes);
  });
  it('rejects a new recovery project at capacity without removing existing copies', async () => {
    const { saveRecovery } = await import('./file-io');
    for (let i = 1; i <= 20; i++) {
      await writeFile(
        recovery(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}.armature.json`),
        'previous copy',
      );
    }
    const project = exportProjectDocument(
      createDocument(newDocState('recovery'), { now: () => 0, createIds: makeIdFactory }),
    );
    const result = await saveRecovery(project, [], {
      documentId: '00000000-0000-4000-8000-000000000021',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected recovery storage limit');
    expect(result.error.message).toContain('Existing copies were preserved');
    expect(await readdir(join(native.directory, 'recovery'))).toHaveLength(20);
    expect(await readFile(recovery(), 'utf8')).toBe('previous copy');
  });

  it('accepts only the bounded startup option through IPC', () => {
    expect(recoveryOpenRequestSchema.safeParse(undefined).success).toBe(true);
    expect(recoveryOpenRequestSchema.safeParse({ startup: true }).success).toBe(true);
    expect(recoveryOpenRequestSchema.safeParse({ path: '/outside' }).success).toBe(false);
    expect(recoveryOpenRequestSchema.safeParse({ startup: 'true' }).success).toBe(false);
  });
});
