import { describe, expect, it } from 'vitest';
import { mergeAtlases } from './merge-atlas';
import type { AtlasRef } from '@marionette/format/types';

function atlas(file: string, names: readonly string[]): AtlasRef {
  return {
    pages: [
      {
        file,
        width: 64,
        height: 64,
        regions: names.map((name) => ({
          name,
          x: 0,
          y: 0,
          w: 16,
          h: 16,
          rotated: false,
          offsetX: 0,
          offsetY: 0,
          originalW: 16,
          originalH: 16,
        })),
      },
    ],
  };
}
describe('additive image import', () => {
  it('keeps unrelated sprites and moves only matching region names to new pixels', () => {
    const original = atlas('old.png', ['body', 'hand']);
    const imported = atlas('new.png', ['hand', 'hat']);
    const result = mergeAtlases(original, imported);
    expect(
      result.pages.map((page) => [page.file, page.regions.map((region) => region.name)]),
    ).toEqual([
      ['old.png', ['body']],
      ['new.png', ['hand', 'hat']],
    ]);
    expect(original.pages[0]?.regions.map((region) => region.name)).toEqual(['body', 'hand']);
  });
  it('combines identical content pages without duplicating their payload address', () => {
    expect(mergeAtlases(atlas('same.png', ['a']), atlas('same.png', ['b'])).pages).toHaveLength(1);
  });
  it('rejects ambiguous duplicate imported names', () => {
    expect(() => mergeAtlases({ pages: [] }, atlas('new.png', ['same', 'same']))).toThrow(
      /Duplicate/,
    );
  });
});
