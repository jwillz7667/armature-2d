import type { Texture } from 'pixi.js';
import type { AtlasRef } from '@marionette/format/types';
import {
  buildRegionTextures,
  makeRegionTextureResolver,
  type RegionTextureResolver,
} from '@marionette/runtime-web';
import type { AtlasImportPage } from '../../shared';
import { loadPageTextures } from '../panels/atlas-textures';

export interface PreparedAtlas {
  readonly atlas: AtlasRef;
  readonly pages: readonly AtlasImportPage[];
  readonly resolver: RegionTextureResolver;
  dispose(): void;
}

export async function prepareAtlas(
  atlas: AtlasRef,
  pages: readonly AtlasImportPage[],
): Promise<PreparedAtlas> {
  if (pages.reduce((size, page) => size + page.data.byteLength, 0) > 512 * 1024 * 1024)
    throw new Error('Textures exceed 512 MiB');
  const textures = await loadPageTextures(pages);
  let regions = new Map<string, Texture>();
  const dispose = (): void => {
    for (const region of regions.values()) region.destroy();
    regions.clear();
    for (const texture of textures.values()) texture.destroy(true);
    textures.clear();
  };
  try {
    for (const page of atlas.pages) {
      const texture = textures.get(page.file);
      if (texture && (texture.width !== page.width || texture.height !== page.height)) {
        throw new Error(`Texture dimensions do not match the atlas: ${page.file}`);
      }
    }
    regions = buildRegionTextures(atlas, textures);
    return { atlas, pages, resolver: makeRegionTextureResolver(regions), dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

// Raw asset bytes are immutable and retained for this project's undo history. Only the ACTIVE atlas
// owns GPU resources. Undo re-decodes retained bytes instead of referring to destroyed textures.
export class AtlasTextureStore {
  private readonly bytes = new Map<string, AtlasImportPage>();
  private readonly prepared = new Map<string, PreparedAtlas>();
  private active: PreparedAtlas | null = null;
  private atlas: AtlasRef = { pages: [] };
  private key = '';
  private generation = 0;
  private byteSize = 0;
  private readonly listeners = new Set<() => void>();

  getResolver(): RegionTextureResolver | null {
    return this.active?.resolver ?? null;
  }
  getPageBytes(): readonly AtlasImportPage[] {
    return this.atlas.pages.flatMap((page) => {
      const bytes = this.bytes.get(page.file);
      return bytes ? [bytes] : [];
    });
  }

  install(prepared: PreparedAtlas): void {
    const additional = prepared.pages.reduce(
      (total, page) => total + (this.bytes.has(page.file) ? 0 : page.data.byteLength),
      0,
    );
    if (this.byteSize + additional > 512 * 1024 * 1024) {
      throw new Error(
        'Texture history exceeds 512 MiB. Save and reopen the project before importing more textures.',
      );
    }
    // Imports use content-addressed filenames. A conflicting same-name payload is refused instead of
    // silently changing what an earlier undo state points to.
    for (const page of prepared.pages) {
      const existing = this.bytes.get(page.file);
      if (
        existing &&
        (existing.data.length !== page.data.length ||
          existing.data.some((byte, index) => byte !== page.data[index]))
      ) {
        throw new Error(`Texture name already refers to different pixels: ${page.file}`);
      }
    }
    for (const page of prepared.pages) {
      if (!this.bytes.has(page.file))
        this.bytes.set(page.file, { ...page, data: new Uint8Array(page.data) });
    }
    this.byteSize += additional;
    const key = JSON.stringify(prepared.atlas);
    this.prepared.get(key)?.dispose();
    this.prepared.set(key, prepared);
  }

  async activate(atlas: AtlasRef): Promise<void> {
    const key = JSON.stringify(atlas);
    if (key === this.key) return;
    const generation = ++this.generation;
    this.key = key;
    this.atlas = atlas;
    this.active?.dispose();
    this.active = null;
    const staged = this.prepared.get(key);
    this.prepared.delete(key);
    if (staged) {
      this.active = staged;
      this.emit();
      return;
    }
    this.emit();
    const next = await prepareAtlas(atlas, this.getPageBytes());
    if (generation !== this.generation) {
      next.dispose();
      return;
    }
    this.active = next;
    this.emit();
  }

  discardPrepared(prepared: PreparedAtlas): void {
    const key = JSON.stringify(prepared.atlas);
    if (this.prepared.get(key) === prepared) this.prepared.delete(key);
    if (this.active !== prepared) prepared.dispose();
  }

  clear(): void {
    ++this.generation;
    this.active?.dispose();
    this.active = null;
    for (const atlas of this.prepared.values()) atlas.dispose();
    this.prepared.clear();
    this.bytes.clear();
    this.byteSize = 0;
    this.key = '';
    this.atlas = { pages: [] };
    this.emit();
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const atlasTextureStore = new AtlasTextureStore();
export const effectsTextureStore = new AtlasTextureStore();
