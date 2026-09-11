import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

// Hold the file descriptor and allocate only the checked size. readFile() after stat()
// can keep allocating if another process grows the file during the read.
export async function readBoundedFile(
  path: string,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error('Invalid file byte limit');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxBytes)
      throw new Error(`File is not a regular file or exceeds ${maxBytes} bytes`);
    const bytes = new Uint8Array(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await file.read(bytes, offset, bytes.length - offset, offset);
      if (result.bytesRead === 0) throw new Error('File changed while being read');
      offset += result.bytesRead;
    }
    const probe = new Uint8Array(1);
    if ((await file.read(probe, 0, 1, offset)).bytesRead !== 0)
      throw new Error('File changed while being read');
    return bytes;
  } finally {
    await file.close();
  }
}
