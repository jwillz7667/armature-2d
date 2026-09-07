import type { AtlasRef } from '@marionette/format/types';
import { atlasTextureStore, prepareAtlas } from '../editor-state/atlas-texture-store';
import type { AtlasImportPage } from '../../shared';

export async function restoreAtlasTextures(
  atlas: AtlasRef,
  pages: readonly AtlasImportPage[],
): Promise<void> {
  const prepared = await prepareAtlas(atlas, pages);
  try {
    atlasTextureStore.install(prepared);
    await atlasTextureStore.activate(atlas);
  } catch (error) {
    atlasTextureStore.discardPrepared(prepared);
    throw error;
  }
}
