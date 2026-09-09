import { inspectPng } from '@marionette/format';
import { basename, extname, join } from 'node:path';
import { mapWithConcurrency } from './concurrency';
import { decodePng } from './png';
import type { AtlasFileStore } from './file-store';

// TASK-1.3.1 Import: read source PNGs from a directory, decode each to RGBA, with BOUNDED concurrency.
// Never Promise.all an unbounded directory listing; at most MAX_IMPORT_CONCURRENCY reads are in flight.

export const MAX_IMPORT_CONCURRENCY = 8;

export interface ImportedSprite {
  // Region name: the file base name without extension (e.g. `torso.png` -> `torso`).
  readonly name: string;
  readonly fileName: string;
  readonly width: number;
  readonly height: number;
  // Row-major RGBA, length === width * height * 4.
  readonly rgba: Uint8Array;
}

function isPng(fileName: string): boolean {
  return extname(fileName).toLowerCase() === '.png';
}

export async function importSprites(
  dir: string,
  fileStore: AtlasFileStore,
): Promise<ImportedSprite[]> {
  const entries = await fileStore.listDir(dir);
  // Sort for a deterministic import order. The pack step re-sorts by its own fixed key, but a stable
  // import order keeps any intermediate consumer (and test) reproducible.
  const pngFiles = entries
    .filter(isPng)
    .slice()
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  if (pngFiles.length > 4096) throw new Error('Atlas import exceeds 4096 source images');
  let sourceBytes = 0;
  let pixels = 0;
  return mapWithConcurrency(pngFiles, MAX_IMPORT_CONCURRENCY, async (fileName) => {
    const bytes = await fileStore.readBytes(join(dir, fileName));
    sourceBytes += bytes.byteLength;
    const header = inspectPng(bytes);
    pixels += header.width * header.height;
    if (sourceBytes > 512 * 1024 * 1024 || pixels > 64 * 1024 * 1024) {
      throw new Error('Atlas import exceeds 512 MiB source data or 64 million decoded pixels');
    }
    const image = decodePng(bytes);
    return {
      name: basename(fileName, extname(fileName)),
      fileName,
      width: image.width,
      height: image.height,
      rgba: image.rgba,
    };
  });
}
