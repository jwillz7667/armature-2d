import { exportProjectDocument, type Document } from '@marionette/document-core';
import { validateSlotScene } from '@marionette/format/slot';
import { validateSpinResult, type SpinResult } from '@marionette/math-bridge';
import { sequence } from '@marionette/runtime-core';
import { scenarioScene, scenarioTimeline, type SlotPreviewScenarioId } from './slot-preview-model';

export function parseRecordedScenario(input: unknown, rows: number, cols: number): SpinResult {
  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(cols) ||
    rows < 1 ||
    rows > 12 ||
    cols < 1 ||
    cols > 12
  )
    throw new Error('Recorded scenario dimensions must be within 1 to 12.');
  const result = validateSpinResult(input, { rows, cols });
  if (!result.ok) throw new Error(`${result.error.path}: ${result.error.message}`);
  return result.value;
}

// Shared project projection for preview, diagnostics, and workflow tests. Recorded results remain
// transient presentation inputs and are never added to the project or editing history.
export function prepareSlotPreview(
  doc: Document,
  scenario: SlotPreviewScenarioId,
  recorded: SpinResult | null = null,
) {
  const project = exportProjectDocument(doc);
  const skeleton = project.skeleton.bones.length > 0 ? project.skeleton : null;
  const effects = project.effects;
  const source = project.slotScene.scene;
  if (recorded) parseRecordedScenario(recorded, source.grid.rows, source.grid.cols);
  const scene = recorded ? source : scenarioScene(source, scenario);
  const timeline = recorded ? sequence(recorded, scene) : scenarioTimeline(source, scenario);
  const resolved = new Set<string>();
  for (const [id, mapping] of Object.entries(scene.symbols)) {
    if (!mapping) continue;
    if (
      skeleton &&
      mapping.skeletonRef === skeleton.name &&
      [mapping.idle, mapping.land, mapping.win, mapping.anticipation ?? mapping.win].every((name) =>
        Object.hasOwn(skeleton.animations, name),
      )
    )
      resolved.add(id);
  }
  const report = validateSlotScene(project.slotScene, {
    skeleton: (name) =>
      skeleton && name === skeleton.name
        ? { hash: skeleton.hash, animations: Object.keys(skeleton.animations) }
        : null,
    vfxPreset: (name) =>
      Object.hasOwn(effects.effects, name) || Object.hasOwn(effects.bundles, name)
        ? { hash: effects.hash }
        : null,
  });
  const missing = new Set(
    timeline.directives
      .filter((d) => d.kind === 'symbolLand')
      .map((d) => d.symbol)
      .filter((id) => !resolved.has(id)),
  );
  const notices = report.errors.map((error) => `${error.path}: ${error.message}`);
  if (missing.size) notices.push(`Map artwork for: ${[...missing].join(', ')}`);
  return { skeleton, effects, scene, timeline, resolved, notices, hash: project.hash };
}

export type SlotPreviewInput = ReturnType<typeof prepareSlotPreview>;
