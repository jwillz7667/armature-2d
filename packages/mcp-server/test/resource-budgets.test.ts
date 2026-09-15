import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeFileStore } from '../src/node-files';
import { createStorageBudget, type StorageLimits } from '../src/storage-budget';
import { createRequestBudget } from '../src/request-budget';

let root: string | undefined;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
const limits: StorageLimits = {
  tenantBytes: 10,
  tenantFiles: 2,
  totalBytes: 15,
  totalFiles: 3,
  reserveBytes: 1,
};
async function fixture() {
  root = await mkdtemp(join(tmpdir(), 'armature-budget-'));
  const alice = join(root, 'alice');
  const bob = join(root, 'bob');
  await mkdir(alice);
  await mkdir(bob);
  const storageBudget = createStorageBudget(root, limits);
  return {
    root,
    alice,
    bob,
    a: createNodeFileStore(alice, { storageBudget, maxFileBytes: 10 }),
    b: createNodeFileStore(bob, { storageBudget, maxFileBytes: 10 }),
  };
}
describe('hosted storage budgets', () => {
  it('rejects tenant growth without overwriting existing data and allows shrinking replacements', async () => {
    const { a, alice } = await fixture();
    await a.write('one.json', '12345678');
    await expect(a.write('two.json', '123')).rejects.toMatchObject({ code: 'STORAGE_QUOTA' });
    expect(await readFile(join(alice, 'one.json'), 'utf8')).toBe('12345678');
    await a.write('one.json', '12');
    await a.write('two.json', '12345678');
    await expect(a.write('three.json', '')).rejects.toMatchObject({ code: 'STORAGE_QUOTA' });
    await expect(a.write('one.json', '123')).rejects.toMatchObject({ code: 'STORAGE_QUOTA' });
    expect(await a.read('one.json')).toBe('12');
  });
  it('serializes competing writes across tenants so global capacity cannot be oversubscribed', async () => {
    const { a, b } = await fixture();
    const results = await Promise.allSettled([
      a.write('one', '1234567890'),
      b.write('one', '1234567890'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
  it('recounts persisted data after coordinator restart and bounds file reads/writes', async () => {
    const { root, a, alice } = await fixture();
    await a.write('one', '1234567890');
    const reopened = createNodeFileStore(alice, {
      storageBudget: createStorageBudget(root, limits),
      maxFileBytes: 5,
    });
    await expect(reopened.write('two', '1')).rejects.toMatchObject({ code: 'STORAGE_QUOTA' });
    await expect(reopened.write('one', '123456')).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    await expect(reopened.read('one')).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    expect(await a.read('one')).toBe('1234567890');
  });
  it('preserves traversal denial when a storage budget is enabled', async () => {
    const { a } = await fixture();
    await expect(a.write('../escape', 'x')).rejects.toMatchObject({ code: 'PATH_FORBIDDEN' });
  });
});
describe('request budgets', () => {
  it('limits each identity, expires windows, and keeps the key table bounded', () => {
    let now = 0;
    const take = createRequestBudget(2, 1000, 2, () => now);
    expect(take('a')).toBe(0);
    expect(take('a')).toBe(0);
    expect(take('a')).toBe(1);
    expect(take('b')).toBe(0);
    expect(take('c')).toBe(1);
    now = 1000;
    expect(take('c')).toBe(0);
    expect(take('a')).toBe(0);
  });
});
