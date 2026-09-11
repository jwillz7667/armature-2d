import type { SceneRefs } from '@marionette/format/slot-types';
import { sceneRefsSchema } from '@marionette/format/slot';
import type { Command, CommandContext } from '../command/command';
import { CommandNotAppliedError, SlotEditError } from '../command/errors';
import type { CommandSpec } from './spec';

// A validated structural edit with a by-value memento. This stores presentation configuration only.
export class SetSceneRefsCommand implements Command {
  readonly kind = 'slot.refs.set';
  readonly label = 'Set Scene References';
  private before: SceneRefs | undefined;
  private readonly value: SceneRefs;
  constructor(value: SceneRefs) {
    this.value = structuredClone(value);
  }
  do(ctx: CommandContext): void {
    const parsed = sceneRefsSchema.safeParse(this.value);
    if (!parsed.success)
      throw new SlotEditError(
        'emptyName',
        parsed.error.issues[0]?.message ?? 'Invalid configuration',
      );
    for (const group of [this.value.skeletons, this.value.vfxPresets])
      if (new Set(group.map((ref) => ref.name)).size !== group.length)
        throw new SlotEditError('emptyName', 'Reference names must be unique.');
    if (this.before === undefined) this.before = structuredClone(ctx.mutate.slotScene().refs);
    ctx.mutate.setSceneRefs(this.value);
  }
  undo(ctx: CommandContext): void {
    if (this.before === undefined) throw new CommandNotAppliedError(this.kind);
    ctx.mutate.setSceneRefs(this.before);
  }
}
export const setSceneRefsSpec: CommandSpec = {
  kind: 'slot.refs.set',
  representativeSeedId: 'minimal',
  fixture: (model) => ({
    command: new SetSceneRefsCommand({
      ...model.slotScene().refs,
      vfxPresets: [{ name: 'spark', hash: '1'.repeat(64) }],
    }),
  }),
  assertApplied: (before, after) => {
    if (JSON.stringify(before.slotScene) === JSON.stringify(after.slotScene))
      throw new Error('Configuration did not change.');
  },
};
