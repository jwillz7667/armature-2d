import { open, readdir, writeFile } from 'node:fs/promises';
import { AtlasError } from './errors';
import { constants } from 'node:fs';

// Injected filesystem so the trim/pack logic is unit-testable without touching real disk, mirroring how
// packages/mcp-server injects its FileStore. The default node:fs implementation is used by the IPC layer;
// tests use an in-memory store (memory-file-store.ts). Unlike the mcp-server store this one operates on
// bytes (atlas PNGs are binary) and lists a directory. It does NOT confine paths to a root: the atlas
// service runs in the Electron main process and is handed trusted absolute paths from the project config
// or a main-process dialog, never raw renderer input (the path-injection defense lives at the IPC edge,
// the same posture as main/file-io.ts).
export interface AtlasFileStore {
  readBytes(path: string): Promise<Uint8Array>;
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  // Returns the file base names directly under `path` (no directories, no recursion).
  listDir(path: string): Promise<readonly string[]>;
}

export function createNodeFileStore(): AtlasFileStore {
  return {
    readBytes: async (path) => {
      const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 256 * 1024 * 1024)
          throw new AtlasError(
            'ATLAS_RESOURCE_LIMIT',
            'Atlas source must be a regular file no larger than 256 MiB',
          );
        const bytes = new Uint8Array(stat.size);
        let offset = 0;
        while (offset < bytes.length) {
          const read = await file.read(bytes, offset, bytes.length - offset, offset);
          if (!read.bytesRead)
            throw new AtlasError('ATLAS_SOURCE_CHANGED', 'Atlas source changed while reading');
          offset += read.bytesRead;
        }
        const extra = await file.read(new Uint8Array(1), 0, 1, offset);
        if (extra.bytesRead)
          throw new AtlasError('ATLAS_SOURCE_CHANGED', 'Atlas source grew while reading');
        return bytes;
      } finally {
        await file.close();
      }
    },
    writeBytes: async (path, data) => writeFile(path, data),
    listDir: async (path) => {
      const entries = await readdir(path, { withFileTypes: true });
      return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    },
  };
}
