import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import { Worker } from 'node:worker_threads';
import { atlasImportResponseSchema } from '../shared';
import { confinePagePath } from './project-textures';
import type { AtlasImportImagesRequest, AtlasImportResponse, IpcResult } from '../shared';

// Atlas import runs in the main process only (the renderer is sandboxed, no Node, no Electron). The
// renderer supplies NO filesystem path: the source directory always comes from a main-process dialog
// (path-injection defense, mirroring file-io.ts). The deterministic pack pipeline (runAtlasPipeline) is
// already unit-tested; this handler is the Electron seam around it and returns a typed IpcResult, never a
// bare throw across the wire.

// Packed page PNGs are written under the app's userData directory, never into the user's source folder.
// userData is app-owned and writable on every platform, so importing does not pollute the user's assets
// and needs no second "where to save" dialog (which would also widen the path-injection surface). The
// Each import uses a unique temporary directory, removed after page bytes reach the renderer.
const ATLAS_OUTPUT_SUBDIR = 'atlas';
// Renderer-supplied images (drag-drop / file picker) are staged here before packing, then removed. Keyed by
// a random id so concurrent imports never collide; app-owned, so it never pollutes the user's assets.
const ATLAS_STAGING_SUBDIR = 'atlas-staging';

function handlerError(message: string): IpcResult<never> {
  return { ok: false, error: { code: 'IPC_HANDLER_ERROR', message } };
}

// Pack a prepared source directory and read the packed page PNGs back into bytes for the sandboxed
// renderer. Shared by directory import and staged-image import. The page read fails the whole import (no
// partial success): the renderer gets every page or a typed error.
async function packAndReadPages(
  sourceDir: string,
  outputDir: string,
): Promise<IpcResult<AtlasImportResponse>> {
  try {
    await mkdir(outputDir, { recursive: true });
  } catch {
    return handlerError(`could not create atlas output directory ${outputDir}`);
  }
  try {
    const data = await new Promise<AtlasImportResponse>((resolve, reject) => {
      const worker = new Worker(new URL('./atlas-import-worker.js', import.meta.url), {
        workerData: { sourceDir, outputDir },
        resourceLimits: { maxOldGenerationSizeMb: 768 },
      });
      let settled = false;
      const finish = (value?: AtlasImportResponse, error?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate().then(() => {
          if (value) resolve(value);
          else reject(error ?? new Error('Atlas worker exited without a result'));
        }, reject);
      };
      const timer = setTimeout(
        () => finish(undefined, new Error('Atlas import exceeded 60 seconds; reduce source size')),
        60000,
      );
      worker.on('message', (value: unknown) => {
        const parsed = atlasImportResponseSchema.safeParse(value);
        if (parsed.success) finish(parsed.data);
        else finish(undefined, new Error('Atlas import failed or exceeded resource limits'));
      });
      worker.on('error', (error) => finish(undefined, error));
      worker.on('exit', () => finish());
    });
    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return handlerError(`atlas import failed: ${message}`);
  } finally {
    await rm(outputDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function importAtlasFromDirectoryInternal(): Promise<IpcResult<AtlasImportResponse>> {
  const openOptions = {
    title: 'Import Sprites',
    properties: ['openDirectory' as const],
  };
  // showOpenDialog has parent-window and no-parent overloads; a focused window may not exist, so dispatch
  // to the matching overload rather than pass BrowserWindow | undefined (mirrors file-io.ts).
  const focused = BrowserWindow.getFocusedWindow();
  const result = focused
    ? await dialog.showOpenDialog(focused, openOptions)
    : await dialog.showOpenDialog(openOptions);
  const sourceDir = result.filePaths[0];
  if (result.canceled || sourceDir === undefined) {
    return { ok: true, data: { status: 'canceled' } };
  }

  const outputDir = join(
    app.getPath('userData'),
    ATLAS_OUTPUT_SUBDIR,
    `${basename(sourceDir)}-${randomUUID()}`,
  );
  return packAndReadPages(sourceDir, outputDir);
}

// Import images the renderer supplied as bytes (drag-drop onto the assets panel, or a file-input picker).
// The bytes are staged into an app-owned, per-import staging directory (never the user's assets), then the
// SAME deterministic pack runs on that directory. Each supplied name is untrusted: confinePagePath keeps
// every write inside the staging dir and rejects a name carrying any path component (a plain basename is
// required), so a hostile name cannot write outside staging. The staging directory is always removed
// afterward. Names the pipeline does not recognize as PNG are ignored by the packer (it filters to PNG),
// matching the folder-import behavior.
async function importAtlasImagesInternal(
  images: AtlasImportImagesRequest['images'],
): Promise<IpcResult<AtlasImportResponse>> {
  const importId = randomUUID();
  const stagingDir = join(app.getPath('userData'), ATLAS_STAGING_SUBDIR, importId);
  try {
    await mkdir(stagingDir, { recursive: true });
  } catch {
    return handlerError(`could not create atlas staging directory ${stagingDir}`);
  }

  try {
    for (const image of images) {
      const dest = confinePagePath(stagingDir, image.name);
      if (dest === null) continue; // unsafe name (path component / traversal): skip defensively
      await writeFile(dest, image.data);
    }
    const outputDir = join(app.getPath('userData'), ATLAS_OUTPUT_SUBDIR, `images-${importId}`);
    return await packAndReadPages(stagingDir, outputDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return handlerError(`atlas import failed: ${message}`);
  } finally {
    // Best-effort cleanup of the staging bytes; packed output is cleaned up by packAndReadPages.
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

let importBusy = false;
async function withImportSlot(
  operation: () => Promise<IpcResult<AtlasImportResponse>>,
): Promise<IpcResult<AtlasImportResponse>> {
  if (importBusy) return handlerError('An atlas import is already running');
  importBusy = true;
  try {
    return await operation();
  } finally {
    importBusy = false;
  }
}
export function importAtlasFromDirectory(): Promise<IpcResult<AtlasImportResponse>> {
  return withImportSlot(importAtlasFromDirectoryInternal);
}
export function importAtlasImages(
  images: AtlasImportImagesRequest['images'],
): Promise<IpcResult<AtlasImportResponse>> {
  return withImportSlot(() => importAtlasImagesInternal(images));
}
