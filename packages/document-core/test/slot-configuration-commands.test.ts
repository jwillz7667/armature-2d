import { describe, expect, it } from 'vitest';
import {
  createDocument,
  newDocState,
  makeIdFactory,
  SetFeatureFlowGraphCommand,
  SetSceneRefsCommand,
  SetWinSequencerCommand,
  ReorderWinSequenceStepCommand,
  MapSymbolAnimSetCommand,
} from '../src';
import { symbolId } from '@marionette/format/slot';

const fresh = () =>
  createDocument(newDocState('scene'), { now: () => 0, createIds: makeIdFactory });
describe('slot configuration safety', () => {
  it('rejects invalid graph, default sequence, and duplicate references before recording history', () => {
    const doc = fresh();
    const before = doc.model.snapshot();
    const commands = [
      new SetFeatureFlowGraphCommand({
        entry: 'base',
        states: { base: {} },
        transitions: [{ from: 'base', to: 'missing', on: { type: 'freeSpinsAwarded' } }],
      }),
      new SetWinSequencerCommand({
        ...doc.model.slotScene().winSequencer,
        defaultSequence: 'missing',
      }),
      new SetSceneRefsCommand({
        skeletons: [],
        vfxPresets: [
          { name: 'fx', hash: '0'.repeat(64) },
          { name: 'fx', hash: '1'.repeat(64) },
        ],
      }),
    ];
    for (const command of commands) {
      expect(() => doc.history.execute(command)).toThrow();
      expect(doc.model.snapshot()).toEqual(before);
      expect(doc.history.canUndo).toBe(false);
    }
  });

  it('composes relative reorder permutations for correct coalesced redo', () => {
    const doc = fresh();
    doc.history.execute(
      new SetWinSequencerCommand({
        ...doc.model.slotScene().winSequencer,
        sequences: {
          base: {
            steps: [0, 200, 500].map((atMs) => ({
              atMs,
              target: { kind: 'allWinningCells' },
              action: { kind: 'animateWin' },
            })),
          },
        },
      }),
    );
    const before = doc.model.snapshot();
    doc.history.checkpoint();
    doc.history.beginInteraction();
    doc.history.execute(new ReorderWinSequenceStepCommand('base', [1, 0, 2]));
    doc.history.execute(new ReorderWinSequenceStepCommand('base', [0, 2, 1]));
    doc.history.endInteraction('Reorder win steps');
    expect(doc.model.slotScene().winSequencer.sequences.base!.steps.map((s) => s.atMs)).toEqual([
      200, 500, 0,
    ]);
    const after = doc.model.snapshot();
    doc.history.undo();
    expect(doc.model.snapshot()).toEqual(before);
    doc.history.redo();
    expect(doc.model.snapshot()).toEqual(after);
  });

  it('prunes replaced skeleton bindings, refreshes hashes, and restores both on undo', () => {
    const doc = fresh();
    const id = symbolId('A');
    const set = (skeletonRef: string, skeletonHash: string) =>
      doc.history.execute(
        new MapSymbolAnimSetCommand(id, {
          animSet: { skeletonRef, idle: 'idle', land: 'land', win: 'win' },
          skeletonHash,
        }),
      );
    set('old', '0'.repeat(64));
    const before = doc.model.snapshot();
    set('new', '1'.repeat(64));
    expect(doc.model.slotScene().refs.skeletons).toEqual([{ name: 'new', hash: '1'.repeat(64) }]);
    doc.history.undo();
    expect(doc.model.snapshot()).toEqual(before);
    set('old', '2'.repeat(64));
    expect(doc.model.slotScene().refs.skeletons[0]!.hash).toBe('2'.repeat(64));
    doc.history.undo();
    expect(doc.model.snapshot()).toEqual(before);
  });
});
