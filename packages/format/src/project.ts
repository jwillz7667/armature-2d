import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { boneSchema } from './schema/bone';
import { skeletonDocumentSchema } from './schema/document';
import { effectsDocumentSchema } from './effects/schema/document';
import { parseEffectsDocument } from './effects/validate';
import { slotSceneDocumentSchema } from './slot/scene-document';
import { verifySlotSceneContentHash } from './slot/hash/hash';
import { canonicalContentHash, verifyContentHash } from './hash/hash';
import { validateSemantic } from './validate/semantic';
import {
  CURRENT_FORMAT_VERSION,
  SLOT_SCENE_FORMAT_VERSION,
  PROJECT_FORMAT_VERSION,
} from './version/constants';

// Editable projects have their own version line. In particular, an unfinished project can have no
// bones. Standalone skeleton/runtime exports still require at least one bone.
export { PROJECT_FORMAT_VERSION } from './version/constants';
export const MAX_PROJECT_ASSET_BYTES = 256 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 512 * 1024 * 1024;

export function isSafeAssetPath(file: string): boolean {
  return (
    file.length > 0 &&
    !file.includes('\\') &&
    !/[\x00-\x1f:]/.test(file) &&
    file.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

const assetSchema = z
  .object({
    scope: z.enum(['skeleton', 'effects']),
    file: z.string().refine(isSafeAssetPath, 'asset path must be a safe relative path'),
    encoding: z.literal('base64'),
    data: z
      .string()
      .max(Math.ceil(MAX_PROJECT_ASSET_BYTES / 3) * 4)
      .refine(isBase64, 'invalid base64 asset'),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const projectDocumentSchema = z
  .object({
    projectFormatVersion: z.literal(PROJECT_FORMAT_VERSION),
    name: z.string().min(1),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
    skeleton: skeletonDocumentSchema.extend({
      formatVersion: z
        .string()
        .refine(
          (version): boolean => version === CURRENT_FORMAT_VERSION,
          'unsupported embedded skeleton version',
        ),
      bones: z.array(boneSchema),
    }),
    effects: effectsDocumentSchema,
    slotScene: slotSceneDocumentSchema,
    assets: z.array(assetSchema).max(4096),
  })
  .strict();

export type ProjectDocument = z.infer<typeof projectDocumentSchema>;
export type ProjectAsset = z.infer<typeof assetSchema>;
export type ProjectAssetScope = ProjectAsset['scope'];

export class ProjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectValidationError';
  }
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function isBase64(value: string): boolean {
  if (value.length % 4 !== 0) return false;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const end = value.length - padding;
  for (let i = 0; i < end; ++i) {
    const c = value.charCodeAt(i);
    if (
      !(
        (c >= 65 && c <= 90) ||
        (c >= 97 && c <= 122) ||
        (c >= 48 && c <= 57) ||
        c === 43 ||
        c === 47
      )
    )
      return false;
  }
  // Padding bits must be zero: accept one canonical encoding per byte sequence.
  const last = ALPHABET.indexOf(value[end - 1] ?? '');
  return padding === 0 || (padding === 1 ? (last & 3) === 0 : (last & 15) === 0);
}

export function encodeProjectAsset(
  scope: ProjectAssetScope,
  file: string,
  bytes: Uint8Array,
): ProjectAsset {
  if (bytes.byteLength > MAX_PROJECT_ASSET_BYTES || !isSafeAssetPath(file)) {
    throw new ProjectValidationError(`Invalid or oversized asset: ${file}`);
  }
  // Chunks bound intermediate string storage and avoid spreading large buffers onto the stack.
  const chunks: string[] = [];
  let chunk = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    chunk +=
      ALPHABET[a >>> 2]! +
      ALPHABET[((a & 3) << 4) | (b >>> 4)]! +
      (i + 1 < bytes.length ? ALPHABET[((b & 15) << 2) | (c >>> 6)]! : '=') +
      (i + 2 < bytes.length ? ALPHABET[c & 63]! : '=');
    if (chunk.length >= 16384) {
      chunks.push(chunk);
      chunk = '';
    }
  }
  chunks.push(chunk);
  return {
    scope,
    file,
    encoding: 'base64',
    data: chunks.join(''),
    hash: bytesToHex(sha256(bytes)),
  };
}

export function decodeProjectAsset(input: ProjectAsset): Uint8Array {
  const asset = assetSchema.parse(input);
  const size =
    (asset.data.length / 4) * 3 -
    (asset.data.endsWith('==') ? 2 : asset.data.endsWith('=') ? 1 : 0);
  if (size > MAX_PROJECT_ASSET_BYTES)
    throw new ProjectValidationError(`Asset too large: ${asset.file}`);
  const bytes = new Uint8Array(size);
  let out = 0;
  for (let i = 0; i < asset.data.length; i += 4) {
    const value =
      (ALPHABET.indexOf(asset.data[i]!) << 18) |
      (ALPHABET.indexOf(asset.data[i + 1]!) << 12) |
      (Math.max(0, ALPHABET.indexOf(asset.data[i + 2]!)) << 6) |
      Math.max(0, ALPHABET.indexOf(asset.data[i + 3]!));
    if (out < size) bytes[out++] = (value >>> 16) & 255;
    if (out < size) bytes[out++] = (value >>> 8) & 255;
    if (out < size) bytes[out++] = value & 255;
  }
  if (bytesToHex(sha256(bytes)) !== asset.hash) {
    throw new ProjectValidationError(`Asset hash mismatch: ${asset.file}`);
  }
  return bytes;
}

export function computeProjectContentHash(project: ProjectDocument): string {
  return canonicalContentHash(project);
}

export function isProjectDocument(input: unknown): boolean {
  return typeof input === 'object' && input !== null && 'projectFormatVersion' in input;
}

export function parseProjectDocument(
  input: unknown,
  options: { readonly requireAssets?: boolean } = {},
): ProjectDocument {
  const result = projectDocumentSchema.safeParse(input);
  if (!result.success) throw new ProjectValidationError(result.error.message);
  const project = result.data;
  if (computeProjectContentHash(project) !== project.hash) {
    throw new ProjectValidationError('Project hash mismatch');
  }
  const errors = validateSemantic(project.skeleton);
  if (errors.length > 0)
    throw new ProjectValidationError(errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
  if (!verifyContentHash(project.skeleton))
    throw new ProjectValidationError('Skeleton hash mismatch');
  parseEffectsDocument(project.effects, { verifyHash: true });
  // External slot scene references are resolved by the slot runtime/Problems panel. The project
  // boundary preserves unfinished authoring state while checking the sibling envelope and hash.
  if (
    project.slotScene.slotSceneFormatVersion !== SLOT_SCENE_FORMAT_VERSION ||
    !verifySlotSceneContentHash(project.slotScene)
  ) {
    throw new ProjectValidationError('Slot scene version or hash mismatch');
  }
  const keys = new Set<string>();
  let total = 0;
  for (const asset of project.assets) {
    const key = `${asset.scope}:${asset.file}`;
    if (keys.has(key)) throw new ProjectValidationError(`Duplicate project asset: ${key}`);
    keys.add(key);
    total += asset.data.length;
    if (total > MAX_PROJECT_BYTES)
      throw new ProjectValidationError('Project assets exceed the size limit');
    decodeProjectAsset(asset);
  }
  if (options.requireAssets) {
    for (const [scope, atlas] of [
      ['skeleton', project.skeleton.atlas],
      ['effects', project.effects.atlas],
    ] as const) {
      for (const page of atlas.pages) {
        if (!keys.has(`${scope}:${page.file}`))
          throw new ProjectValidationError(`Missing ${scope} texture: ${page.file}`);
      }
    }
  }
  return project;
}
