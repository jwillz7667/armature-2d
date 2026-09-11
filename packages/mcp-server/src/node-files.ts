import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { lstat, open, readdir, realpath, rename, unlink, type FileHandle } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep, join, dirname } from 'node:path';
import { McpToolError } from './errors';
import type { FileStore } from './files';

const MAX_FILE_BYTES = 256 * 1024 * 1024;
const noFollow = constants.O_NOFOLLOW ?? 0;

// The configured root is trusted; paths below it are not. Links and junctions below the root are
// forbidden, including links that currently resolve inside it. Linux walks held directory descriptors
// so replacing an ancestor with a symlink cannot redirect a read or create operation. Other platforms
// validate components and the opened file identity; the host must prevent concurrent directory
// replacement by hostile processes. This application policy is not a replacement for an OS sandbox.
export function createNodeFileStore(projectRoot: string): FileStore {
  const root = resolve(projectRoot);
  const forbidden = (path: string): McpToolError =>
    new McpToolError(
      'PATH_FORBIDDEN',
      `path "${path}" must stay inside the project without links`,
      { root },
    );

  const partsOf = (path: string): string[] => {
    const rel = relative(root, resolve(root, path));
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw forbidden(path);
    return rel === '' ? [] : rel.split(sep);
  };

  const withPath = async <T>(
    path: string,
    directoryTarget: boolean,
    action: (file: string) => Promise<T>,
  ): Promise<T> => {
    const parts = partsOf(path);
    const canonicalRoot = await realpath(root);
    const directories: FileHandle[] = [];
    let current = canonicalRoot;
    try {
      if (process.platform === 'linux') {
        const handle = await open(
          canonicalRoot,
          constants.O_RDONLY | constants.O_DIRECTORY | noFollow,
        );
        directories.push(handle);
        current = `/proc/self/fd/${handle.fd}`;
      }
      const ancestors = directoryTarget ? parts : parts.slice(0, -1);
      for (const component of ancestors) {
        const child = join(current, component);
        const stat = await lstat(child);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw forbidden(path);
        if (process.platform === 'linux') {
          const handle = await open(child, constants.O_RDONLY | constants.O_DIRECTORY | noFollow);
          directories.push(handle);
          current = `/proc/self/fd/${handle.fd}`;
        } else {
          current = child;
          if ((await realpath(current)) !== current) throw forbidden(path);
        }
      }
      return await action(
        directoryTarget || parts.length === 0 ? current : join(current, parts.at(-1)!),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'ELOOP' || error.code === 'ENOTDIR')
      )
        throw forbidden(path);
      throw error;
    } finally {
      for (const handle of directories.reverse()) await handle.close();
    }
  };

  const withFile = async <T>(
    path: string,
    writing: boolean,
    action: (handle: FileHandle) => Promise<T>,
  ): Promise<T> =>
    withPath(path, false, async (file) => {
      let expected;
      try {
        expected = await lstat(file);
      } catch (error) {
        if (!(writing && error instanceof Error && 'code' in error && error.code === 'ENOENT'))
          throw error;
      }
      if (
        expected &&
        (!expected.isFile() || expected.isSymbolicLink() || (writing && expected.nlink > 1))
      )
        throw forbidden(path);
      const flags = writing
        ? constants.O_WRONLY | (expected ? 0 : constants.O_CREAT | constants.O_EXCL)
        : constants.O_RDONLY;
      const handle = await open(file, flags | noFollow, 0o600);
      try {
        const actual = await handle.stat();
        if (
          !actual.isFile() ||
          (expected && (actual.dev !== expected.dev || actual.ino !== expected.ino))
        )
          throw forbidden(path);
        if (!writing && actual.size > MAX_FILE_BYTES)
          throw new McpToolError('FILE_TOO_LARGE', `file exceeds ${MAX_FILE_BYTES} bytes`);
        return await action(handle);
      } finally {
        await handle.close();
      }
    });

  const readBinary = (path: string): Promise<Uint8Array> =>
    withFile(path, false, (handle) => handle.readFile());
  const writeBinary = async (path: string, data: Uint8Array): Promise<void> => {
    if (data.byteLength > MAX_FILE_BYTES)
      throw new McpToolError('FILE_TOO_LARGE', `file exceeds ${MAX_FILE_BYTES} bytes`);
    await withPath(path, false, async (file) => {
      try {
        const target = await lstat(file);
        if (!target.isFile() || target.isSymbolicLink() || target.nlink > 1) throw forbidden(path);
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
      const temporary = join(dirname(file), `.marionette-${randomUUID()}.tmp`);
      const handle = await open(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow,
        0o600,
      );
      let closed = false;
      try {
        await handle.writeFile(data);
        await handle.sync();
        await handle.close();
        closed = true;
        await rename(temporary, file);
      } finally {
        if (!closed) await handle.close();
        await unlink(temporary).catch((error: unknown) => {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        });
      }
    });
  };
  return {
    read: async (path) => new TextDecoder().decode(await readBinary(path)),
    write: async (path, content) => writeBinary(path, new TextEncoder().encode(content)),
    readBinary,
    writeBinary,
    listDir: async (path) =>
      withPath(path, true, async (directory) => {
        const entries = await readdir(directory, { withFileTypes: true });
        return entries
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name)
          .sort();
      }),
  };
}
