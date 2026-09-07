import { atlasRefSchema } from '@marionette/format';
import type { AtlasRef } from '@marionette/format/types';
import type { Document } from '@marionette/document-core';
import { SetAtlasRefCommand, documentHost } from '../document';
import { atlasTextureStore, prepareAtlas } from '../editor-state/atlas-texture-store';
import { mergeAtlases } from './merge-atlas';
import { bridge } from '../ipc-bridge';
import type {
  AtlasImportGridRequest,
  AtlasImportImagesRequest,
  AtlasImportResponse,
  GridSpec,
} from '../../shared';

// The shared sprite-import action (WP-1.3), extracted so BOTH the Assets panel button and the
// File > Import Sprites menu item run the SAME flow: the main process owns the directory dialog and the
// atlas pack (no renderer path, path-injection defense), the result is set on the live document through
// SetAtlasRefCommand (LAW 2), and the page textures are published to the atlas-texture store so the same
// regions render textured in the viewport. Returns a typed outcome so each caller reports it its own way
// (the panel shows a transient notice; the menu logs). The atlas crosses the wire as `unknown`; the
// main-process pipeline is the trusted producer and the format validator re-checks it at export (LAW 3),
// so this single narrowing assertion is justified.

export type SpriteImportOutcome =
  | { readonly kind: 'imported'; readonly regionCount: number }
  | { readonly kind: 'canceled' }
  | { readonly kind: 'error'; readonly message: string };

function countRegions(atlas: AtlasRef): number {
  let count = 0;
  for (const page of atlas.pages) count += page.regions.length;
  return count;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// Apply an imported/packed atlas to the live document and publish its page textures (shared by the folder
// import and the renderer-supplied image import). The SetAtlasRef command runs first so the document
// carries the regions before the textures resolve them; the page bytes are retained alongside the textures
// so a save can persist them next to the project (PP-D5). A texture-build failure leaves the placeholder
// (the document still has the atlas) and surfaces a typed error.
async function applyImportedAtlas(
  response: Extract<AtlasImportResponse, { status: 'imported' }>,
  original: Document,
): Promise<SpriteImportOutcome> {
  // Opaque IPC value; main is the trusted AtlasRef producer and the format validator re-checks it at
  // export (LAW 3), so this single narrowing assertion is justified.
  if (documentHost.current() !== original) return { kind: 'canceled' };
  const revision = original.model.revision;
  const atlas = atlasRefSchema.parse(response.atlas);
  const renamed = new Map<string, string>();
  try {
    const incoming = [];
    for (const page of response.pages) {
      const digest = await crypto.subtle.digest('SHA-256', page.data);
      const hash = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      const file = `texture-${hash}.png`;
      if (renamed.has(page.file)) throw new Error(`Duplicate imported page: ${page.file}`);
      renamed.set(page.file, file);
      incoming.push({ ...page, file });
    }
    const changed = {
      pages: atlas.pages.map((page) => {
        const file = renamed.get(page.file);
        if (!file) throw new Error(`Missing imported texture: ${page.file}`);
        return { ...page, file };
      }),
    };
    const merged = mergeAtlases(original.model.preserved().atlas, changed);
    const allBytes = new Map(
      [...atlasTextureStore.getPageBytes(), ...incoming].map((page) => [page.file, page]),
    );
    const pages = merged.pages.flatMap((page) => {
      const bytes = allBytes.get(page.file);
      return bytes ? [bytes] : [];
    });
    const staged = await prepareAtlas(merged, pages);
    if (original !== documentHost.current() || original.model.revision !== revision) {
      staged.dispose();
      return {
        kind: 'error',
        message: 'The project changed during import. Please import the images again.',
      };
    }
    try {
      atlasTextureStore.install(staged);
      original.history.execute(new SetAtlasRefCommand(merged));
      await atlasTextureStore.activate(merged);
    } catch (error) {
      atlasTextureStore.discardPrepared(staged);
      throw error;
    }
  } catch (error) {
    return { kind: 'error', message: messageOf(error, 'failed to load atlas page textures') };
  }
  return { kind: 'imported', regionCount: countRegions(atlas) };
}

export async function runSpriteImport(): Promise<SpriteImportOutcome> {
  try {
    const original = documentHost.current();
    const result = await bridge().importAtlas();
    if (!result.ok) return { kind: 'error', message: result.error.message };
    if (result.data.status === 'canceled') return { kind: 'canceled' };
    return applyImportedAtlas(result.data, original);
  } catch (error) {
    // A missing bridge (failed preload) throws here; surface it instead of an opaque rejection.
    return { kind: 'error', message: messageOf(error, 'import failed') };
  }
}

// Import images the renderer read as bytes (drag-drop or a file-input picker). Main stages and packs them;
// the result is applied exactly like a folder import. An empty set is a no-op (nothing dropped that read).
export async function runImageImport(
  images: AtlasImportImagesRequest['images'],
): Promise<SpriteImportOutcome> {
  if (images.length === 0) return { kind: 'canceled' };
  try {
    const original = documentHost.current();
    const result = await bridge().importAtlasImages(images);
    if (!result.ok) return { kind: 'error', message: result.error.message };
    if (result.data.status === 'canceled') return { kind: 'canceled' };
    return applyImportedAtlas(result.data, original);
  } catch (error) {
    return { kind: 'error', message: messageOf(error, 'import failed') };
  }
}

// Import an EXISTING packed atlas (image + region descriptor) WITHOUT repacking (PP-D5). Main owns the
// descriptor dialog and reads the sibling page image(s); the resulting AtlasRef is applied through the SAME
// command + texture-publish path as a folder import (LAW 2). A user cancel is a silent no-op.
export async function runPremadeAtlasImport(): Promise<SpriteImportOutcome> {
  try {
    const original = documentHost.current();
    const result = await bridge().importPremadeAtlas();
    if (!result.ok) return { kind: 'error', message: result.error.message };
    if (result.data.status === 'canceled') return { kind: 'canceled' };
    return applyImportedAtlas(result.data, original);
  } catch (error) {
    return { kind: 'error', message: messageOf(error, 'import failed') };
  }
}

// Slice a plain sprite sheet the renderer read as bytes into a uniform grid (PP-D5). The image bytes and the
// grid parameters go to main, which decodes and slices; the AtlasRef is applied exactly like a folder import.
export async function runGridAtlasImport(
  image: AtlasImportGridRequest['image'],
  grid: GridSpec,
): Promise<SpriteImportOutcome> {
  try {
    const original = documentHost.current();
    const result = await bridge().importGridAtlas(image, grid);
    if (!result.ok) return { kind: 'error', message: result.error.message };
    if (result.data.status === 'canceled') return { kind: 'canceled' };
    return applyImportedAtlas(result.data, original);
  } catch (error) {
    return { kind: 'error', message: messageOf(error, 'import failed') };
  }
}
