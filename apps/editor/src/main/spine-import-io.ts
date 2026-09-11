import { basename, extname } from 'node:path';
import { computeContentHash, parseDocument } from '@marionette/format';
import type { SpineImportResponse } from '../shared';
import { convertSpineProject } from './spine-import-convert';
import { withImportFiles } from './import-files';
import { buildSpineAtlas, parseSpineAtlas } from './spine-atlas';

export async function importSpineWithAssets(path: string): Promise<SpineImportResponse> {
  return withImportFiles(path, async (files) => {
    const name = basename(path);
    const bytes = await files.read(name, 64 * 1024 * 1024);
    const converted = convertSpineProject(
      path,
      extname(path).toLowerCase() === '.skel'
        ? { kind: 'skel', bytes }
        : { kind: 'json', text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) },
    );
    if (converted.status !== 'imported') return converted;
    const document = parseDocument(converted.document);
    if (!document.atlas.pages.length) return { ...converted, pages: [] };
    const atlasName = `${basename(path, extname(path))}.atlas`;
    let descriptor: Uint8Array;
    try {
      descriptor = await files.read(atlasName, 4 * 1024 * 1024);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return {
          ...converted,
          pages: [],
          warnings: converted.warnings.map((w) =>
            w.feature === 'atlas-synthesized'
              ? {
                  ...w,
                  why: `No sibling ${atlasName} was found. Texture geometry is a placeholder and artwork will be missing. Place the atlas and its PNG pages beside the JSON and import again.`,
                }
              : w,
          ),
        };
      throw error;
    }
    const parsed = parseSpineAtlas(new TextDecoder('utf-8', { fatal: true }).decode(descriptor));
    const images = new Map<string, Uint8Array>();
    for (const page of parsed.pages)
      images.set(page.file, await files.read(page.file, 256 * 1024 * 1024));
    const packed = buildSpineAtlas(parsed, images);
    const next = { ...document, atlas: packed.atlas };
    const validated = parseDocument({ ...next, hash: computeContentHash(next) });
    return {
      ...converted,
      document: validated,
      pages: packed.pages,
      warnings: [
        ...converted.warnings.filter((w) => w.feature !== 'atlas-synthesized'),
        ...packed.warnings,
      ],
    };
  });
}
