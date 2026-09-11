import type { FeatureFlowGraph } from '@marionette/format/slot-types';
import { featureFlowGraphSchema } from '@marionette/format/slot';
import type { Command, CommandContext } from '../command/command';
import { CommandNotAppliedError, SlotEditError } from '../command/errors';
import type { CommandSpec } from './spec';

// A validated structural edit with a by-value memento. This stores presentation configuration only.
export class SetFeatureFlowGraphCommand implements Command {
  readonly kind = 'slot.flow.set';
  readonly label = 'Set Feature Flow';
  private before: FeatureFlowGraph | undefined;
  private readonly value: FeatureFlowGraph;
  constructor(value: FeatureFlowGraph) {
    this.value = structuredClone(value);
  }
  do(ctx: CommandContext): void {
    const parsed = featureFlowGraphSchema.safeParse(this.value);
    if (!parsed.success)
      throw new SlotEditError(
        'emptyName',
        parsed.error.issues[0]?.message ?? 'Invalid configuration',
      );
    if (this.value.entry !== 'base' || !Object.hasOwn(this.value.states, 'base'))
      throw new SlotEditError('baseStateProtected', 'The graph requires a base entry.');
    for (const transition of this.value.transitions)
      if (
        !Object.hasOwn(this.value.states, transition.from) ||
        !Object.hasOwn(this.value.states, transition.to)
      )
        throw new SlotEditError('stateMissing', 'A transition endpoint does not exist.');
    if (this.before === undefined)
      this.before = structuredClone(ctx.mutate.slotScene().featureFlows);
    ctx.mutate.setSlotFeatureFlows(this.value);
  }
  undo(ctx: CommandContext): void {
    if (this.before === undefined) throw new CommandNotAppliedError(this.kind);
    ctx.mutate.setSlotFeatureFlows(this.before);
  }
}
export const setFeatureFlowGraphSpec: CommandSpec = {
  kind: 'slot.flow.set',
  representativeSeedId: 'minimal',
  fixture: (model) => ({
    command: new SetFeatureFlowGraphCommand({
      ...model.slotScene().featureFlows,
      states: { ...model.slotScene().featureFlows.states, celebration: {} },
    }),
  }),
  assertApplied: (before, after) => {
    if (
      JSON.stringify(before.slotScene.featureFlows) === JSON.stringify(after.slotScene.featureFlows)
    )
      throw new Error('Configuration did not change.');
  },
};
