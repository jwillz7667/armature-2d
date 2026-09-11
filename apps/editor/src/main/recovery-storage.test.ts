import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRecoveryStorage } from './recovery-storage';

let directory: string;
const name = '00000000-0000-4000-8000-000000000001.armature.json';
const another = '00000000-0000-4000-8000-000000000002.armature.json';
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'recovery-budget-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('recovery storage budget', () => {
  it('budgets atomic overlap and preserves both old copies on rejection', async () => {
    await writeFile(join(directory, name), '1234567890');
    await writeFile(join(directory, `${name}.bak`), '12345');
    await expect(
      checkRecoveryStorage(directory, name, 20, { maxBytes: 39, maxProjects: 1 }),
    ).rejects.toThrow('preserved');
    await expect(
      checkRecoveryStorage(directory, name, 20, { maxBytes: 40, maxProjects: 1 }),
    ).resolves.toBeUndefined();
    expect(await readFile(join(directory, name), 'utf8')).toBe('1234567890');
    expect(await readFile(join(directory, `${name}.bak`), 'utf8')).toBe('12345');
  });
  it('counts a primary and backup as one project, and protects backup-only projects', async () => {
    await writeFile(join(directory, name), '1');
    await writeFile(join(directory, `${name}.bak`), '1');
    await expect(
      checkRecoveryStorage(directory, name, 1, { maxBytes: 100, maxProjects: 1 }),
    ).resolves.toBeUndefined();
    await expect(
      checkRecoveryStorage(directory, another, 1, { maxBytes: 100, maxProjects: 1 }),
    ).rejects.toThrow('full');
    await rm(join(directory, name));
    await expect(
      checkRecoveryStorage(directory, name, 5, { maxBytes: 5, maxProjects: 1 }),
    ).rejects.toThrow('full');
    await expect(
      checkRecoveryStorage(directory, another, 1, { maxBytes: 100, maxProjects: 1 }),
    ).rejects.toThrow('full');
  });
  it('includes abandoned staging files in the byte budget without deleting them', async () => {
    await writeFile(join(directory, '.abandoned.tmp'), '12345');
    await expect(
      checkRecoveryStorage(directory, name, 6, { maxBytes: 10, maxProjects: 20 }),
    ).rejects.toThrow('full');
    expect(await readFile(join(directory, '.abandoned.tmp'), 'utf8')).toBe('12345');
  });
});
