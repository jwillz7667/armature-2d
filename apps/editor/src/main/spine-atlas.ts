import {
  bytesSha256,
  decodePng,
  encodePng,
  packAtlas,
  type TrimmedSprite,
} from '@marionette/atlas-pack';
import { inspectPng, type AtlasRef } from '@marionette/format';
import type { AtlasImportPage, SpineImportWarning } from '../shared';

// Clean-room parser from https://esotericsoftware.com/spine-atlas-format.
// Source page rotations are counterclockwise. Repacking upright pixels avoids interpreting
// them as Armature's clockwise rotation flag. Atlas offsets measure left/bottom whitespace.
interface Region {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  left: number;
  bottom: number;
  originalW: number;
  originalH: number;
}
interface Page {
  file: string;
  width: number;
  height: number;
  pma: boolean;
  regions: Region[];
}
interface Section {
  name: string;
  fields: Map<string, string>;
  line: number;
}
export interface ParsedSpineAtlas {
  pages: Page[];
  warnings: SpineImportWarning[];
}

function fail(line: number, message: string): never {
  throw new Error(`SPINE_ATLAS_INVALID at line ${line}: ${message}`);
}
function integers(section: Section, key: string, count: number, fallback?: number[]): number[] {
  const raw = section.fields.get(key);
  if (raw === undefined) {
    if (fallback) return fallback;
    return fail(section.line, `${section.name} requires ${key}`);
  }
  const values = raw.split(',').map((v) => Number(v.trim()));
  if (values.length !== count || values.some((v) => !Number.isSafeInteger(v)))
    fail(section.line, `${key} needs ${count} integers`);
  return values;
}

export function parseSpineAtlas(text: string): ParsedSpineAtlas {
  if (text.length > 4 * 1024 * 1024) throw new Error('Spine atlas descriptor exceeds 4 MiB');
  const groups: Section[][] = [];
  let group: Section[] | null = null;
  let section: Section | null = null;
  for (const [i, raw] of text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .entries()) {
    const line = raw.trim();
    if (!line) {
      group = null;
      section = null;
      continue;
    }
    const colon = line.indexOf(':');
    if (colon < 0) {
      if (!group) {
        group = [];
        groups.push(group);
      }
      section = { name: line, fields: new Map(), line: i + 1 };
      group.push(section);
    } else {
      if (!section) fail(i + 1, 'property has no page or region');
      const key = line.slice(0, colon).trim();
      if (section.fields.has(key)) fail(i + 1, `duplicate property ${key}`);
      section.fields.set(key, line.slice(colon + 1).trim());
    }
  }
  if (!groups.length || groups.length > 64) throw new Error('Spine atlas requires 1 to 64 pages');
  const warnings: SpineImportWarning[] = [];
  const names = new Set<string>();
  const files = new Set<string>();
  const pages: Page[] = groups.map(([header, ...sections]) => {
    if (!header) throw new Error('Empty atlas page');
    if (files.has(header.name)) fail(header.line, `duplicate page ${header.name}`);
    files.add(header.name);
    const [width = 0, height = 0] = integers(header, 'size', 2, [0, 0]);
    const pma = header.fields.get('pma') ?? 'false';
    if (pma !== 'true' && pma !== 'false') fail(header.line, 'pma must be true or false');
    const ignored = (s: Section, supported: readonly string[]): void => {
      for (const key of s.fields.keys())
        if (!supported.includes(key))
          warnings.push({
            feature: 'atlas-metadata',
            path: `/atlas/line/${s.line}/${key}`,
            why: `Atlas metadata ${key} on ${s.name} is not used by the editor.`,
          });
    };
    ignored(header, ['size', 'pma', 'format']);
    const regions = sections.map((s): Region => {
      if (names.has(s.name))
        fail(
          s.line,
          `duplicate region ${s.name}; indexed duplicate names need unique exported region paths`,
        );
      names.add(s.name);
      if (names.size > 10000) fail(s.line, 'atlas exceeds 10000 regions');
      const rect = s.fields.has('bounds')
        ? integers(s, 'bounds', 4)
        : [...integers(s, 'xy', 2), ...integers(s, 'size', 2)];
      const [x = 0, y = 0, w = 0, h = 0] = rect;
      const offsets = s.fields.has('offsets')
        ? integers(s, 'offsets', 4)
        : [...integers(s, 'offset', 2, [0, 0]), ...integers(s, 'orig', 2, [w, h])];
      const [left = 0, bottom = 0, originalW = w, originalH = h] = offsets;
      const rotate = s.fields.get('rotate') ?? 'false';
      const rotation = rotate === 'true' ? 90 : rotate === 'false' ? 0 : Number(rotate);
      if (![0, 90, 180, 270, 360].includes(rotation))
        fail(s.line, 'only quarter-turn rotations are supported');
      if (
        x < 0 ||
        y < 0 ||
        w < 1 ||
        h < 1 ||
        left < 0 ||
        bottom < 0 ||
        originalW < left + w ||
        originalH < bottom + h
      )
        fail(s.line, 'invalid region rectangle or whitespace offsets');
      ignored(s, ['bounds', 'xy', 'size', 'offsets', 'offset', 'orig', 'rotate']);
      return {
        name: s.name,
        x,
        y,
        w,
        h,
        rotation: rotation % 360,
        left,
        bottom,
        originalW,
        originalH,
      };
    });
    return { file: header.name, width, height, pma: pma === 'true', regions };
  });
  if (!names.size) throw new Error('Spine atlas contains no regions');
  return { pages, warnings };
}

export function buildSpineAtlas(
  parsed: ParsedSpineAtlas,
  images: ReadonlyMap<string, Uint8Array>,
): { atlas: AtlasRef; pages: AtlasImportPage[]; warnings: SpineImportWarning[] } {
  const sprites: TrimmedSprite[] = [];
  let decodedPixels = 0;
  let regionPixels = 0;
  for (const page of parsed.pages) {
    const bytes = images.get(page.file);
    if (!bytes) throw new Error(`Missing atlas image ${page.file}`);
    const dimensions = inspectPng(bytes);
    decodedPixels += dimensions.width * dimensions.height;
    if (decodedPixels > 64 * 1024 * 1024)
      throw new Error('Spine atlas exceeds 64 million decoded pixels');
    const image = decodePng(bytes);
    if ((page.width && page.width !== image.width) || (page.height && page.height !== image.height))
      throw new Error(`Atlas page ${page.file} dimensions do not match its PNG`);
    for (const region of page.regions) {
      const { w, h, rotation } = region;
      const fw = rotation % 180 ? h : w;
      const fh = rotation % 180 ? w : h;
      if (region.x + fw > image.width || region.y + fh > image.height)
        throw new Error(`Atlas region ${region.name} exceeds ${page.file}`);
      regionPixels += w * h;
      if (regionPixels > 64 * 1024 * 1024)
        throw new Error('Spine regions exceed 64 million pixels');
      const pixels = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y += 1)
        for (let x = 0; x < w; x += 1) {
          const sx =
            rotation === 90 ? y : rotation === 180 ? w - 1 - x : rotation === 270 ? h - 1 - y : x;
          const sy =
            rotation === 90 ? w - 1 - x : rotation === 180 ? h - 1 - y : rotation === 270 ? x : y;
          const from = ((region.y + sy) * image.width + region.x + sx) * 4;
          const to = (y * w + x) * 4;
          const alpha = image.rgba[from + 3]!;
          for (let c = 0; c < 3; c += 1)
            pixels[to + c] = page.pma
              ? alpha
                ? Math.min(255, Math.round((image.rgba[from + c]! * 255) / alpha))
                : 0
              : image.rgba[from + c]!;
          pixels[to + 3] = alpha;
        }
      sprites.push({
        name: region.name,
        trimmedW: w,
        trimmedH: h,
        offsetX: region.left,
        offsetY: region.originalH - h - region.bottom,
        originalW: region.originalW,
        originalH: region.originalH,
        pixels,
      });
    }
  }
  const largest = sprites.reduce((n, sprite) => Math.max(n, sprite.trimmedW, sprite.trimmedH), 1);
  const padding = largest > 4092 ? 0 : 2;
  const desired = Math.max(largest + padding * 2, Math.ceil(Math.sqrt(regionPixels * 1.25)));
  const maxPageSize = Math.min(4096, 2 ** Math.ceil(Math.log2(desired)));
  const packed = packAtlas(sprites, { maxPageSize, padding });
  const pages = packed.pageBitmaps.map((image) => {
    const data = new Uint8Array(encodePng(image));
    return { file: `spine-${bytesSha256(data)}.png`, data };
  });
  const atlas = { pages: packed.atlas.pages.map((page, i) => ({ ...page, file: pages[i]!.file })) };
  const warnings = [...parsed.warnings];
  if (parsed.pages.some((p) => p.pma))
    warnings.push({
      feature: 'atlas-pma-normalized',
      path: '/atlas',
      why: 'Premultiplied source pages were normalized to straight alpha. Low-alpha RGB may differ by rounding.',
    });
  return { atlas, pages, warnings };
}
