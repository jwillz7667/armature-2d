import type { AtlasRef, AtlasRegion, Skin } from '@marionette/format';
import type { Diagnostics } from '../diagnostics';

// Pure conversion has no filesystem access. The editor replaces these placeholders with
// sibling atlas geometry and pixels before installing the import; API consumers get a notice.
export function synthesizeAtlas(skins: readonly Skin[], diag: Diagnostics): AtlasRef {
  const names = collectRegionNames(skins);
  if (names.length === 0) return { pages: [] };

  const regions: AtlasRegion[] = names.map((name) => ({
    name,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    rotated: false,
    offsetX: 0,
    offsetY: 0,
    originalW: 0,
    originalH: 0,
  }));

  diag.warn(
    'atlas-synthesized',
    '',
    `Spine JSON carries no atlas geometry; ${regions.length} placeholder region(s) were synthesized so attachment paths resolve. Use the editor import with a sibling .atlas and PNG pages to install real artwork.`,
    { regions: regions.length },
  );

  return { pages: [{ file: 'imported-atlas.png', width: 0, height: 0, regions }] };
}

// The ascending, de-duplicated set of region names referenced by textured attachments across all skins.
function collectRegionNames(skins: readonly Skin[]): string[] {
  const names = new Set<string>();
  for (const skin of skins) {
    for (const slotAttachments of Object.values(skin.attachments)) {
      for (const attachment of Object.values(slotAttachments)) {
        if (
          attachment.type === 'region' ||
          attachment.type === 'mesh' ||
          attachment.type === 'linkedmesh'
        ) {
          names.add(attachment.path);
        }
      }
    }
  }
  return [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
