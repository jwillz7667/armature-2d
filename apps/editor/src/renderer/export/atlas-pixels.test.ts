import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodePng } from '@marionette/atlas-pack';
import { decodeAtlasPixels } from './atlas-pixels';

afterEach(() => vi.unstubAllGlobals());
const data = new Uint8Array(
  encodePng({ width: 1, height: 1, rgba: new Uint8Array([255, 0, 0, 255]) }),
);

describe('export PNG resource ownership', () => {
  it('rejects malformed PNGs before invoking the browser decoder', async () => {
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    await expect(
      decodeAtlasPixels([{ file: 'bad.png', data: new Uint8Array([1]) }]),
    ).rejects.toThrow('PNG');
    expect(decode).not.toHaveBeenCalled();
  });

  it('closes every decoded bitmap and fails the export if a later canvas cannot be created', async () => {
    const first = { width: 1, height: 1, close: vi.fn() };
    const second = { width: 1, height: 1, close: vi.fn() };
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second),
    );
    const context = {
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray([255, 0, 0, 255]) }),
    };
    const getContext = vi.fn().mockReturnValueOnce(context).mockReturnValueOnce(null);
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext = getContext;
      },
    );
    await expect(
      decodeAtlasPixels([
        { file: 'a.png', data },
        { file: 'b.png', data },
      ]),
    ).rejects.toThrow('canvas');
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
  });

  it('closes bitmaps when pixel extraction throws', async () => {
    const bitmap = { width: 1, height: 1, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return {
            drawImage() {
              throw new Error('decode failed');
            },
          };
        }
      },
    );
    await expect(decodeAtlasPixels([{ file: 'a.png', data }])).rejects.toThrow('decode failed');
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
