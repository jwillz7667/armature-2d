import { constants } from 'node:fs';
import { lstat, open, readdir, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { McpToolError } from './errors';

export interface StorageLimits {
  readonly tenantBytes: number;
  readonly tenantFiles: number;
  readonly totalBytes: number;
  readonly totalFiles: number;
  readonly reserveBytes: number;
}
export const HOSTED_STORAGE_LIMITS: StorageLimits = {
  tenantBytes: 32 * 1024 * 1024,
  tenantFiles: 256,
  totalBytes: 256 * 1024 * 1024,
  totalFiles: 4096,
  reserveBytes: 64 * 1024 * 1024,
};

// One coordinator per hosted process: check and write share a lock across all tenants.
// Recount persisted files so restarts and failed writes cannot reset the quota accounting.
export function createStorageBudget(
  dataRoot: string,
  limits: StorageLimits = HOSTED_STORAGE_LIMITS,
) {
  if (Object.values(limits).some((n) => !Number.isSafeInteger(n) || n < 1))
    throw new Error('Storage limits must be positive integers');
  let tail = Promise.resolve();
  const exhausted = () => new McpToolError('STORAGE_QUOTA', 'Project storage limit reached');
  async function usage(root: string, maxFiles: number) {
    let bytes = 0;
    let files = 0;
    let visited = 0;
    async function walk(directory: string, depth: number): Promise<void> {
      if (depth > 32 || ++visited > limits.totalFiles + 1024) throw exhausted();
      const handle = await open(
        directory,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      try {
        const held = process.platform === 'linux' ? `/proc/self/fd/${handle.fd}` : directory;
        for (const entry of await readdir(held, { withFileTypes: true })) {
          if (++visited > limits.totalFiles + 1024) throw exhausted();
          const path = join(held, entry.name);
          if (entry.isSymbolicLink()) throw exhausted();
          if (entry.isDirectory()) await walk(path, depth + 1);
          else {
            const stat = await lstat(path);
            if (!stat.isFile() || stat.isSymbolicLink()) throw exhausted();
            bytes += stat.size;
            if (++files > maxFiles) throw exhausted();
          }
        }
      } finally {
        await handle.close();
      }
    }
    await walk(root, 0);
    return { bytes, files };
  }
  return {
    async write<T>(
      tenantRoot: string,
      heldTarget: string,
      bytes: number,
      action: () => Promise<T>,
    ): Promise<T> {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        let oldBytes = 0;
        let addedFiles = 1;
        try {
          oldBytes = (await lstat(heldTarget)).size;
          addedFiles = 0;
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        }
        const tenant = await usage(tenantRoot, limits.tenantFiles);
        const total = await usage(dataRoot, limits.totalFiles);
        const free = await statfs(dataRoot, { bigint: true });
        // Atomic replacement temporarily holds both versions, so reserve the full new file.
        if (
          tenant.bytes - oldBytes + bytes > limits.tenantBytes ||
          tenant.files + addedFiles > limits.tenantFiles ||
          total.bytes - oldBytes + bytes > limits.totalBytes ||
          total.files + addedFiles > limits.totalFiles ||
          free.bavail * free.bsize < BigInt(limits.reserveBytes + bytes)
        )
          throw exhausted();
        return await action();
      } finally {
        release();
      }
    },
  };
}
export type StorageBudget = ReturnType<typeof createStorageBudget>;
