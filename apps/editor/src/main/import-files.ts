import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { isSafeAssetPath } from '@marionette/format';

export interface ImportFiles {
  read(name: string, limit: number): Promise<Uint8Array<ArrayBuffer>>;
}

// Directory selected by the native dialog is the capability. Descriptor-supplied names may
// read only regular, unlinked siblings. Linux anchors reads to a held directory descriptor.
export async function withImportFiles<T>(
  path: string,
  run: (files: ImportFiles) => Promise<T>,
): Promise<T> {
  const root = await realpath(dirname(path));
  const directory = await open(
    root,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  const original = await directory.stat();
  let total = 0;
  try {
    return await run({
      async read(name, limit) {
        if (!isSafeAssetPath(name) || basename(name) !== name || /[\\/:]/.test(name))
          throw new Error('Import image must be a plain sibling filename');
        const source =
          process.platform === 'linux' ? `/proc/self/fd/${directory.fd}/${name}` : join(root, name);
        if (process.platform !== 'linux') {
          const check = await open(
            root,
            constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
          );
          try {
            const now = await check.stat();
            if (
              now.dev !== original.dev ||
              now.ino !== original.ino ||
              (await realpath(root)) !== root
            )
              throw new Error('Import directory changed during the read');
          } finally {
            await check.close();
          }
        }
        const file = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const stat = await file.stat();
          if (
            !stat.isFile() ||
            stat.nlink !== 1 ||
            stat.size > limit ||
            total + stat.size > 512 * 1024 * 1024
          )
            throw new Error(
              `Import file ${name} is linked, non-regular, or exceeds its resource budget`,
            );
          const bytes = new Uint8Array(stat.size + 1);
          let cursor = 0;
          while (cursor < bytes.length) {
            const result = await file.read(bytes, cursor, bytes.length - cursor, cursor);
            if (!result.bytesRead) break;
            cursor += result.bytesRead;
          }
          const after = await file.stat();
          if (
            cursor !== stat.size ||
            after.size !== stat.size ||
            after.mtimeMs !== stat.mtimeMs ||
            after.ctimeMs !== stat.ctimeMs
          )
            throw new Error(`Import file ${name} changed during the read`);
          total += cursor;
          return bytes.slice(0, cursor);
        } finally {
          await file.close();
        }
      },
    });
  } finally {
    await directory.close();
  }
}
