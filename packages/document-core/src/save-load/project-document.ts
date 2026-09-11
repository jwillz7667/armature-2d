import {
  PROJECT_FORMAT_VERSION,
  computeProjectContentHash,
  parseProjectDocument,
} from '@marionette/format';
import type { ProjectAsset, ProjectDocument } from '@marionette/format';
import { computeSlotSceneHash } from '@marionette/format/slot';
import { exportEffects } from '../effects-model/effects-export';
import type { Document } from './document';
import { projectSkeleton } from './export-document';
import { exportSlotSceneDocument } from './slot-scene-document';

export function exportProjectDocument(
  document: Document,
  assets: readonly ProjectAsset[] = [],
): ProjectDocument {
  const skeleton = projectSkeleton(document.model);
  const effects = exportEffects(document.effects);
  const slotDraft = exportSlotSceneDocument(document.model.slotScene(), document.model.name);
  // References to artifacts embedded in this project follow their current content. External references
  // keep their supplied hashes. This projection does not mutate the editing model or its history.
  const slotWithRefs = {
    ...slotDraft,
    refs: {
      skeletons: slotDraft.refs.skeletons.map((ref) =>
        ref.name === skeleton.name ? { ...ref, hash: skeleton.hash } : ref,
      ),
      vfxPresets: slotDraft.refs.vfxPresets.map((ref) =>
        Object.hasOwn(effects.effects, ref.name) || Object.hasOwn(effects.bundles, ref.name)
          ? { ...ref, hash: effects.hash }
          : ref,
      ),
    },
  };
  const draft: ProjectDocument = {
    projectFormatVersion: PROJECT_FORMAT_VERSION,
    name: document.model.name,
    hash: '',
    skeleton,
    effects,
    slotScene: { ...slotWithRefs, hash: computeSlotSceneHash(slotWithRefs) },
    assets: [...assets],
  };
  return parseProjectDocument({ ...draft, hash: computeProjectContentHash(draft) });
}
