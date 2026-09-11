import type { AtlasRef } from '@marionette/format/types';

// Matching region names update in place. Unrelated regions remain addressable by existing slots,
// skins and meshes. Content-addressed page names keep earlier command-history states unambiguous.
export function mergeAtlases(current: AtlasRef, incoming: AtlasRef): AtlasRef {
  const names = new Set<string>();
  for (const page of incoming.pages)
    for (const region of page.regions) {
      if (names.has(region.name)) throw new Error(`Duplicate imported region: ${region.name}`);
      names.add(region.name);
    }
  const pages = new Map<string, AtlasRef['pages'][number]>();
  for (const page of current.pages) {
    const regions = page.regions.filter((region) => !names.has(region.name));
    if (regions.length) pages.set(page.file, { ...page, regions });
  }
  for (const page of incoming.pages) {
    const existing = pages.get(page.file);
    if (existing && (existing.width !== page.width || existing.height !== page.height)) {
      throw new Error(`Conflicting page dimensions: ${page.file}`);
    }
    pages.set(page.file, { ...page, regions: [...(existing?.regions ?? []), ...page.regions] });
  }
  return { pages: [...pages.values()] };
}
