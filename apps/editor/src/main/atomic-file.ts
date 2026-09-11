import { constants } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

// The staged file is flushed and closed before replacing the destination. A failed write/rename
// leaves the old project intact. The injected rename seam exercises the actual commit failure path.
export async function atomicWriteFile(
  path: string,
  data: string | Uint8Array,
  commit: (from: string, to: string) => Promise<void> = rename,
): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    const file = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(data);
      await file.sync();
    } finally {
      await file.close();
    }
    await commit(temporary, path);
    // Directory sync makes the rename durable on supported filesystems. Windows and some virtual
    // filesystems do not support fsync on directories; the atomic replacement has already succeeded.
    try {
      const directory = await open(dirname(path), constants.O_RDONLY);
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          'code' in error &&
          ['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM', 'EACCES', 'EBADF'].includes(String(error.code))
        )
      )
        throw error;
    }
  } finally {
    await unlink(temporary).catch((error: unknown) => {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    });
  }
}
