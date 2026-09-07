import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, unlink } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  computeProjectContentHash,
  decodeProjectAsset,
  encodeProjectAsset,
  isProjectDocument,
  MAX_PROJECT_BYTES,
  parseDocument,
  parseProjectDocument,
  type ProjectDocument,
} from '@marionette/format';
import { app, BrowserWindow, dialog } from 'electron';
import type {
  AtlasImportPage,
  FileOpenResponse,
  FileSaveOptions,
  FileSaveResponse,
  IpcResult,
} from '../shared';
import { confinePagePath, texturesDirFor } from './project-textures';
import { atomicWriteFile } from './atomic-file';

const FILE_FILTERS = [
  { name: 'Armature 2D Project or Skeleton', extensions: ['json'] },
  { name: 'All Files', extensions: ['*'] },
];
// Renderer session ids are opaque keys, never filesystem paths. Open and Save As are the only paths
// that can add destinations to this table, and both get their paths from native dialogs.
const destinations = new Map<string, string>();
let saveQueue: Promise<unknown> = Promise.resolve();
function queued<T>(operation: () => Promise<T>): Promise<T> {
  const result = saveQueue.then(operation);
  saveQueue = result.catch(() => undefined);
  return result;
}

function handlerError(error: unknown): IpcResult<never> {
  return {
    ok: false,
    error: {
      code: 'IPC_HANDLER_ERROR',
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

async function readBoundedFile(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_PROJECT_BYTES)
      throw new Error('Project file is not a regular file or exceeds 512 MiB');
    return new Uint8Array(await file.readFile());
  } finally {
    await file.close();
  }
}

export function projectWithAssets(
  document: unknown,
  pages: readonly AtlasImportPage[],
): ProjectDocument {
  const project = parseProjectDocument(document);
  const assets = new Map(project.assets.map((asset) => [`${asset.scope}:${asset.file}`, asset]));
  for (const page of pages) {
    const asset = encodeProjectAsset(page.scope ?? 'skeleton', page.file, page.data);
    assets.set(`${asset.scope}:${asset.file}`, asset);
  }
  const draft = { ...project, assets: [...assets.values()] };
  return parseProjectDocument(
    { ...draft, hash: computeProjectContentHash(draft) },
    { requireAssets: true },
  );
}

async function writeProject(path: string, project: ProjectDocument): Promise<void> {
  const serialized = `${JSON.stringify(project)}\n`;
  if (Buffer.byteLength(serialized) > MAX_PROJECT_BYTES) throw new Error('Project exceeds 512 MiB');
  // Keep the last successful document as a recoverable sibling before committing the new one.
  let previous: Uint8Array | undefined;
  try {
    previous = await readBoundedFile(path);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  if (previous !== undefined) await atomicWriteFile(`${path}.bak`, previous);
  await atomicWriteFile(path, serialized);
}

export async function saveDocumentToFile(
  document: unknown,
  pages: readonly AtlasImportPage[],
  options?: FileSaveOptions,
): Promise<IpcResult<FileSaveResponse>> {
  const save = async (): Promise<IpcResult<FileSaveResponse>> => {
    try {
      const project = parseProjectDocument(document);
      // Validate all required asset bytes BEFORE the user is told where the project will be saved.
      const packed = projectWithAssets(project, pages);
      let path = options?.saveAs ? undefined : options && destinations.get(options.documentId);
      if (!path) {
        const focused = BrowserWindow.getFocusedWindow();
        const saveOptions = {
          title: 'Save Project',
          filters: FILE_FILTERS,
          defaultPath: `${project.name}.armature.json`,
        };
        const result = focused
          ? await dialog.showSaveDialog(focused, saveOptions)
          : await dialog.showSaveDialog(saveOptions);
        if (result.canceled || !result.filePath) return { ok: true, data: { status: 'canceled' } };
        path = result.filePath;
      }
      await writeProject(path, packed);
      if (options) destinations.set(options.documentId, path);
      return { ok: true, data: { status: 'saved', path } };
    } catch (error) {
      return handlerError(error);
    }
  };
  return queued(save);
}

async function readLegacyPages(
  path: string,
  files: readonly string[],
): Promise<{ pages: AtlasImportPage[]; warnings: string[] }> {
  const pages: AtlasImportPage[] = [];
  const warnings: string[] = [];
  const root = texturesDirFor(path);
  for (const name of files) {
    try {
      const filePath = confinePagePath(root, name);
      if (!filePath) throw new Error('unsafe texture name');
      const info = await lstat(root);
      if (info.isSymbolicLink() || !info.isDirectory())
        throw new Error('linked texture directory is not allowed');
      const directory = await open(
        root,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      try {
        // Linux anchors the read to the opened directory. Other hosts verify the resolved parent.
        const source =
          process.platform === 'linux' ? `/proc/self/fd/${directory.fd}/${name}` : filePath;
        if (process.platform !== 'linux' && (await realpath(root)) !== resolve(root))
          throw new Error('linked texture directory is not allowed');
        pages.push({ file: name, data: await readBoundedFile(source) });
      } finally {
        await directory.close();
      }
    } catch (error) {
      warnings.push(
        `Texture ${name} could not be restored: ${error instanceof Error ? error.message : 'read failed'}`,
      );
    }
  }
  return { pages, warnings };
}

export async function readProjectFile(
  path: string,
): Promise<Extract<FileOpenResponse, { status: 'opened' }>> {
  const bytes = await readBoundedFile(path);
  const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (isProjectDocument(input)) {
    const project = parseProjectDocument(input, { requireAssets: true });
    const pages = project.assets.map((asset) => ({
      scope: asset.scope,
      file: asset.file,
      data: new Uint8Array(decodeProjectAsset(asset)),
    }));
    // Pixels cross IPC once as binary. Keep the renderer's document projection small; its own load
    // path verifies the rehashed envelope with assets supplied separately to the texture stores.
    const draft = { ...project, assets: [] };
    return {
      status: 'opened',
      name: basename(path),
      path,
      document: { ...draft, hash: computeProjectContentHash(draft) },
      pages,
      warnings: [],
    };
  }
  const document = parseDocument(input, { verifyHash: true });
  const restored = await readLegacyPages(
    path,
    document.atlas.pages.map((page) => page.file),
  );
  return { status: 'opened', name: basename(path), path, document, ...restored };
}

export async function openDocumentFromFile(): Promise<IpcResult<FileOpenResponse>> {
  try {
    const focused = BrowserWindow.getFocusedWindow();
    const options = {
      title: 'Open Project',
      properties: ['openFile' as const],
      filters: FILE_FILTERS,
    };
    const result = focused
      ? await dialog.showOpenDialog(focused, options)
      : await dialog.showOpenDialog(options);
    const path = result.filePaths[0];
    if (result.canceled || !path) return { ok: true, data: { status: 'canceled' } };
    const data = await readProjectFile(path);
    const documentId = randomUUID();
    // A legacy skeleton always gets a new project destination on its first Save.
    if (isProjectDocument(data.document)) destinations.set(documentId, path);
    return { ok: true, data: { ...data, documentId } };
  } catch (error) {
    return handlerError(error);
  }
}

const recoveryPath = (documentId: string): string =>
  join(app.getPath('userData'), 'recovery', `${documentId}.armature.json`);

export async function saveRecovery(
  document: unknown,
  pages: readonly AtlasImportPage[],
  options: FileSaveOptions,
): Promise<IpcResult<FileSaveResponse>> {
  return queued(async () => {
    try {
      const path = recoveryPath(options.documentId);
      await mkdir(join(app.getPath('userData'), 'recovery'), { recursive: true });
      await writeProject(path, projectWithAssets(document, pages));
      return { ok: true, data: { status: 'saved', path } };
    } catch (error) {
      return handlerError(error);
    }
  });
}

export async function discardRecovery(
  documentId: string,
): Promise<IpcResult<{ readonly status: 'discarded' }>> {
  return queued(async () => {
    try {
      for (const path of [recoveryPath(documentId), `${recoveryPath(documentId)}.bak`]) {
        await unlink(path).catch((error: unknown) => {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        });
      }
      return { ok: true, data: { status: 'discarded' } };
    } catch (error) {
      return handlerError(error);
    }
  });
}

export async function openRecovery(): Promise<IpcResult<FileOpenResponse>> {
  try {
    const directory = join(app.getPath('userData'), 'recovery');
    await mkdir(directory, { recursive: true });
    const files = await readdir(directory);
    if (!files.some((file) => file.endsWith('.armature.json')))
      return { ok: true, data: { status: 'canceled' } };
    const focused = BrowserWindow.getFocusedWindow();
    const options = {
      title: 'Recover Unsaved Project',
      defaultPath: directory,
      properties: ['openFile' as const],
      filters: FILE_FILTERS,
    };
    const result = focused
      ? await dialog.showOpenDialog(focused, options)
      : await dialog.showOpenDialog(options);
    const path = result.filePaths[0];
    if (result.canceled || !path) return { ok: true, data: { status: 'canceled' } };
    // Recovered content gets a fresh id and a Save As destination, protecting the recovery copy.
    return { ok: true, data: { ...(await readProjectFile(path)), documentId: randomUUID() } };
  } catch (error) {
    return handlerError(error);
  }
}
