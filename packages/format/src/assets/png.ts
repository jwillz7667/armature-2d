// Header/chunk preflight without allocating pixels. The codec remains responsible for CRC, color,
// and compressed-stream validity. Reject duplicate IHDR chunks so decoding cannot override
// the dimensions that passed this budget check.
export function inspectPng(bytes: Uint8Array): { width: number; height: number } {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.byteLength > 256 * 1024 * 1024) throw new Error('PNG exceeds 256 MiB');
  if (bytes.length < 33 || signature.some((b, i) => bytes[i] !== b))
    throw new Error('Invalid PNG signature or header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452)
    throw new Error('PNG must begin with a 13-byte IHDR');
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (!width || !height || width > 16384 || height > 16384 || width * height > 64 * 1024 * 1024)
    throw new Error('PNG exceeds 16384 pixels per dimension or 64 million pixels');
  let offset = 8;
  let ended = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error('Truncated PNG chunk');
    const length = view.getUint32(offset);
    const type = view.getUint32(offset + 4);
    if (offset + 12 + length > bytes.length) throw new Error('Truncated PNG chunk payload');
    if (offset !== 8 && type === 0x49484452) throw new Error('Duplicate PNG IHDR');
    offset += length + 12;
    if (type === 0x49454e44) {
      if (length !== 0 || offset !== bytes.length) throw new Error('Invalid PNG end chunk');
      ended = true;
      break;
    }
  }
  if (!ended) throw new Error('PNG has no end chunk');
  return { width, height };
}
