import { exportProjectDocument } from '@marionette/document-core';
import { decodeProjectAsset, encodeProjectAsset, type ProjectAssetScope } from '@marionette/format';
import type { FileStore } from './files';
import type { Session } from './session';

// Private files are explicit edits; otherwise use the immutable, hash-validated embedded texture.
// Embedded assets are never extracted automatically or allowed to bypass a path-policy failure.
export function projectFiles(
  session: Session,
  files: FileStore,
  scope: ProjectAssetScope,
): FileStore {
  return {
    ...files,
    readBinary: async (path) => {
      try {
        return await files.readBinary(path);
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        const asset = session.assets.find((a) => a.scope === scope && a.file === path);
        if (!asset) throw error;
        return decodeProjectAsset(asset);
      }
    },
  };
}

export async function exportSessionProject(session: Session, files: FileStore) {
  const project = exportProjectDocument(session.document);
  const assets = [];
  for (const [scope, atlas] of [
    ['skeleton', project.skeleton.atlas],
    ['effects', project.effects.atlas],
  ] as const) {
    const source = projectFiles(session, files, scope);
    for (const page of atlas.pages)
      assets.push(encodeProjectAsset(scope, page.file, await source.readBinary(page.file)));
  }
  return exportProjectDocument(session.document, assets);
}
