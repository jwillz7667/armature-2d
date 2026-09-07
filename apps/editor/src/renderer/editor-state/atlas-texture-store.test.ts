import { describe, expect, it, vi } from 'vitest';
import type { AtlasRef } from '@marionette/format/types';
import { AtlasTextureStore, type PreparedAtlas } from './atlas-texture-store';
import { loadPageTextures } from '../panels/atlas-textures';

vi.mock('../panels/atlas-textures', () => ({ loadPageTextures: vi.fn(async () => new Map()) }));
vi.mock('@marionette/runtime-web', () => ({
  buildRegionTextures: () => new Map(),
  makeRegionTextureResolver: () => () => null,
}));
const atlas = (file: string): AtlasRef => ({
  pages: [{ file, width: 16, height: 16, regions: [] }],
});
function staged(file: string, value: number): PreparedAtlas {
  return {
    atlas: atlas(file),
    pages: [{ file, data: new Uint8Array([value]) }],
    resolver: () => null,
    dispose: vi.fn(),
  };
}

describe('atlas history resource ownership', () => {
  it('restores earlier pixels after an atlas replacement and frees inactive GPU resources', async () => {
    const store = new AtlasTextureStore();
    const first = staged('content-a.png', 11);
    const second = staged('content-b.png', 22);
    store.install(first);
    await store.activate(first.atlas);
    store.install(second);
    await store.activate(second.atlas);
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(store.getPageBytes()[0]?.data).toEqual(new Uint8Array([22]));
    await store.activate(first.atlas);
    expect(second.dispose).toHaveBeenCalledOnce();
    expect(store.getPageBytes()[0]?.data).toEqual(new Uint8Array([11]));
    store.clear();
    expect(store.getPageBytes()).toEqual([]);
  });
  it('refuses a same-name replacement that would change earlier history pixels', () => {
    const store = new AtlasTextureStore();
    store.install(staged('same.png', 11));
    expect(() => store.install(staged('same.png', 22))).toThrow(/different pixels/);
    store.clear();
  });
  it('ignores a late decode from a cleared project', async () => {
    const store = new AtlasTextureStore();
    let finish: ((textures: Map<string, never>) => void) | undefined;
    vi.mocked(loadPageTextures).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = store.activate(atlas('old.png'));
    store.clear();
    finish?.(new Map<string, never>());
    await pending;
    expect(store.getResolver()).toBeNull();
    expect(store.getPageBytes()).toEqual([]);
  });
});
