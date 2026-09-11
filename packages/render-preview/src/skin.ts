import type { SkeletonDocument } from '@marionette/format/types';
import { buildSkinState, setActiveSkin, type SkinState } from '@marionette/runtime-core';

const cache = new WeakMap<SkeletonDocument, Map<string, SkinState>>();
export function renderSkin(document: SkeletonDocument, name = 'default'): SkinState {
  let skins = cache.get(document);
  if (!skins) {
    skins = new Map();
    cache.set(document, skins);
  }
  let skin = skins.get(name);
  if (!skin) {
    skin = buildSkinState(document);
    setActiveSkin(skin, name);
    skins.set(name, skin);
  }
  return skin;
}
