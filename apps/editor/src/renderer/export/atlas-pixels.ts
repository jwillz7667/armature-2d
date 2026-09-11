import { inspectPng } from '@marionette/format';
import type { AtlasPagePixels, AtlasPixelSource } from '@marionette/render-preview/browser';
import type { AtlasImportPage } from '../../shared';

// A failed page fails the export. Missing supplied pixels must not turn into a successful
// movie with white placeholders. Every native bitmap closes on every exit path.
export async function decodeAtlasPixels(
  pages: readonly AtlasImportPage[],
): Promise<AtlasPixelSource> {
  const map = new Map<string, AtlasPagePixels>();
  let pixels = 0;
  let bytes = 0;
  for (const page of pages) {
    if (map.has(page.file)) throw new Error(`Duplicate atlas page ${page.file}`);
    const dimensions = inspectPng(page.data);
    pixels += dimensions.width * dimensions.height;
    bytes += page.data.byteLength;
    if (pixels > 64 * 1024 * 1024 || bytes > 512 * 1024 * 1024)
      throw new Error('Export textures exceed their resource budget');
    const bitmap = await createImageBitmap(new Blob([page.data]));
    try {
      if (bitmap.width !== dimensions.width || bitmap.height !== dimensions.height)
        throw new Error('Decoded PNG dimensions differ from its header');
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not create texture decode canvas');
      context.drawImage(bitmap, 0, 0);
      const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
      map.set(page.file, {
        width: bitmap.width,
        height: bitmap.height,
        rgba: new Uint8Array(image.data),
      });
    } finally {
      bitmap.close();
    }
  }
  return { pages: map };
}
