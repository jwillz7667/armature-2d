import type { WinSequenceConfig } from '@marionette/format/slot-types';
import { winSequenceConfigSchema } from '@marionette/format/slot';
import type { Command, CommandContext } from '../command/command';
import { CommandNotAppliedError, SlotEditError } from '../command/errors';
import type { CommandSpec } from './spec';

// A validated structural edit with a by-value memento. This stores presentation configuration only.
export class SetWinSequencerCommand implements Command {
  readonly kind = 'slot.winseq.set';
  readonly label = 'Set Win Sequencer';
  private before: WinSequenceConfig | undefined;
  private readonly value: WinSequenceConfig;
  constructor(value: WinSequenceConfig) {
    this.value = structuredClone(value);
  }
  do(ctx: CommandContext): void {
    const parsed = winSequenceConfigSchema.safeParse(this.value);
    if (!parsed.success)
      throw new SlotEditError(
        'emptyName',
        parsed.error.issues[0]?.message ?? 'Invalid configuration',
      );
    if (!Object.hasOwn(this.value.sequences, this.value.defaultSequence))
      throw new SlotEditError('sequenceMissing', 'Default sequence must exist.');
    for (const sequence of Object.values(this.value.sequences)) {
      if (sequence.steps.filter((step) => step.action.kind === 'rollupStart').length > 1)
        throw new SlotEditError('invalidTiming', 'A line-win sequence has one counter rollup.');
    }
    if (this.before === undefined)
      this.before = structuredClone(ctx.mutate.slotScene().winSequencer);
    ctx.mutate.setSlotWinSequencer(this.value);
  }
  undo(ctx: CommandContext): void {
    if (this.before === undefined) throw new CommandNotAppliedError(this.kind);
    ctx.mutate.setSlotWinSequencer(this.before);
  }
}
export const setWinSequencerSpec: CommandSpec = {
  kind: 'slot.winseq.set',
  representativeSeedId: 'minimal',
  fixture: (model) => ({
    command: new SetWinSequencerCommand({
      ...model.slotScene().winSequencer,
      thresholds: { big: 10, mega: 25, epic: 50 },
    }),
  }),
  assertApplied: (before, after) => {
    if (
      JSON.stringify(before.slotScene.winSequencer) === JSON.stringify(after.slotScene.winSequencer)
    )
      throw new Error('Configuration did not change.');
  },
};
