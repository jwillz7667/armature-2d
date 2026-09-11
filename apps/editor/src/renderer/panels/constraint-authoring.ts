import {
  CompositeCommand,
  CreateIkConstraintCommand,
  CreateTransformConstraintCommand,
  CreatePathConstraintCommand,
  CreatePathAttachmentCommand,
  CreateSlotCommand,
  type BoneId,
  type Document,
  type SlotId,
  type Command,
} from '../document';
import type { ConstraintSelection } from '../editor-state/constraint-selection-store';

export interface ConstraintCreation {
  readonly kind: 'ik' | 'transform' | 'path';
  readonly name: string;
  readonly bones: readonly BoneId[];
  readonly targetBone: BoneId;
  // Omit to create a new editable path on targetBone as part of the same undo entry.
  readonly pathSlot?: SlotId;
}

export function createArtistConstraint(
  doc: Document,
  request: ConstraintCreation,
): {
  selection: ConstraintSelection;
  pathSlot?: SlotId;
} {
  const name = request.name.trim();
  if (!name) throw new Error('Enter a constraint name.');
  if (request.bones.length === 0) throw new Error('Choose at least one constrained bone.');
  if (!doc.model.getBone(request.targetBone)) throw new Error('Choose a target bone.');
  if (request.kind === 'ik') {
    const id = doc.ids.mint('ikConstraint');
    const bones = [...request.bones];
    if (bones.length === 2 && doc.model.getBone(bones[0]!)?.parent === bones[1]) bones.reverse();
    doc.history.execute(
      new CreateIkConstraintCommand(id, name, bones, request.targetBone, 1, true),
    );
    return { selection: { kind: 'ik', id } };
  }
  if (request.kind === 'transform') {
    const id = doc.ids.mint('transformConstraint');
    doc.history.execute(
      new CreateTransformConstraintCommand(id, name, request.bones, request.targetBone, {
        mixRotate: 1,
        mixX: 1,
        mixY: 1,
        mixScaleX: 0,
        mixScaleY: 0,
        mixShearY: 0,
        offsetRotation: 0,
        offsetX: 0,
        offsetY: 0,
        offsetScaleX: 0,
        offsetScaleY: 0,
        offsetShearY: 0,
      }),
    );
    return { selection: { kind: 'transform', id } };
  }
  const commands: Command[] = [];
  const slot = request.pathSlot ?? doc.ids.mint('slot');
  if (request.pathSlot === undefined) {
    const used = new Set(doc.model.slots().map((s) => s.name));
    let slotName = `${name}_path`;
    for (let suffix = 2; used.has(slotName); ++suffix) slotName = `${name}_path_${suffix}`;
    commands.push(
      new CreateSlotCommand(slot, {
        name: slotName,
        bone: request.targetBone,
        color: { r: 1, g: 1, b: 1, a: 1 },
        darkColor: null,
        attachment: 'path',
        blendMode: 'normal',
      }),
      new CreatePathAttachmentCommand(slot, 'path'),
    );
  }
  const id = doc.ids.mint('pathConstraint');
  commands.push(
    new CreatePathConstraintCommand(id, name, slot, request.bones, {
      positionMode: 'percent',
      spacingMode: 'length',
      rotateMode: 'chain',
      position: 0,
      spacing: 0,
      offsetRotation: 0,
      mixRotate: 1,
      mixX: 1,
      mixY: 1,
    }),
  );
  doc.history.execute(new CompositeCommand('Create Path Follower', commands));
  return { selection: { kind: 'path', id }, pathSlot: slot };
}
