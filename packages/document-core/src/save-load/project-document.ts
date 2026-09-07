import {
  PROJECT_FORMAT_VERSION,
  computeProjectContentHash,
  parseProjectDocument,
} from '@marionette/format';
import type { ProjectAsset, ProjectDocument } from '@marionette/format';
import { exportEffects } from '../effects-model/effects-export';
import type { Document } from './document';
import { projectSkeleton } from './export-document';
import { exportSlotSceneDocument } from './slot-scene-document';

export function exportProjectDocument(
  document: Document,
  assets: readonly ProjectAsset[] = [],
): ProjectDocument {
  const draft: ProjectDocument = {
    projectFormatVersion: PROJECT_FORMAT_VERSION,
    name: document.model.name,
    hash: '',
    skeleton: projectSkeleton(document.model),
    effects: exportEffects(document.effects),
    slotScene: exportSlotSceneDocument(document.model.slotScene(), document.model.name),
    assets: [...assets],
  };
  return parseProjectDocument({ ...draft, hash: computeProjectContentHash(draft) });
}
