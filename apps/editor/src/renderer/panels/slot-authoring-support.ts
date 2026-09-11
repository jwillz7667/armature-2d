import {
  CompositeCommand,
  SetSceneRefsCommand,
  documentHost,
  exportEffects,
  type Command,
} from '../document';

export const ROLLUP_CURVES = ['linear', 'easeInQuad', 'easeOutQuad', 'easeInOutCubic'] as const;

// Resolve project effects by name and hash in the same history entry as a new visual binding.
export function executePresentationEdit(command: Command, vfxName?: string): void {
  const doc = documentHost.current();
  if (!vfxName) {
    doc.history.execute(command);
    return;
  }
  const effects = exportEffects(doc.effects);
  if (!Object.hasOwn(effects.effects, vfxName) && !Object.hasOwn(effects.bundles, vfxName))
    throw new Error(`Create effect or bundle "${vfxName}" in the Effects panel first.`);
  const refs = doc.model.slotScene().refs;
  const next = {
    ...refs,
    vfxPresets: [
      ...refs.vfxPresets.filter((ref) => ref.name !== vfxName),
      { name: vfxName, hash: effects.hash },
    ],
  };
  doc.history.execute(
    new CompositeCommand('Bind Presentation Effect', [new SetSceneRefsCommand(next), command]),
  );
}
