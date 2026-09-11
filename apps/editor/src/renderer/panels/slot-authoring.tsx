import { useState, type ReactElement } from 'react';
import { symbolId } from '@marionette/format/slot';
import type { GridConfig, SymbolAnimSet } from '@marionette/format/slot-types';
import {
  MapSymbolAnimSetCommand,
  SetGridConfigCommand,
  SetTumbleChoreographyCommand,
  documentHost,
  exportDocument,
  type SlotSceneState,
} from '../document';
import { ChoiceInput, Group, NumberInput, TextInput, useAuthoringError } from './authoring-fields';
import { SlotWinEditor } from './slot-win-editor';
import { ROLLUP_CURVES } from './slot-authoring-support';
import { SlotFlowEditor } from './slot-flow-editor';

export function SlotAuthoring({ scene }: { scene: SlotSceneState }): ReactElement {
  const effects = documentHost.current().effects;
  const presets = [
    ...effects.effects().map((effect) => effect.name),
    ...effects.bundles().map((bundle) => bundle.name),
  ];
  const { error, run } = useAuthoringError();
  return (
    <div className="authoring slot-authoring">
      <SlotGridEditor grid={scene.grid} />
      <SlotSymbolBrowser scene={scene} />
      <SlotWinEditor
        config={scene.winSequencer}
        presets={presets}
        symbols={Object.keys(scene.symbols)}
      />
      <SlotFlowEditor graph={scene.featureFlows} presets={presets} />
      <Group title="Tumble choreography">
        {error}
        {(['explodeMs', 'dropMs', 'refillStaggerMs', 'settleMs', 'stepGapMs'] as const).map(
          (field) => (
            <NumberInput
              key={field}
              label={field}
              value={scene.tumble[field]}
              min={0}
              step={1}
              onChange={(value) =>
                run(() =>
                  documentHost
                    .current()
                    .history.execute(
                      new SetTumbleChoreographyCommand({ ...scene.tumble, [field]: value }),
                    ),
                )
              }
            />
          ),
        )}
        {(['dropEasing', 'rollupCurve'] as const).map((field) => (
          <ChoiceInput
            key={field}
            label={field}
            value={scene.tumble[field]}
            choices={ROLLUP_CURVES}
            onChange={(value) =>
              run(() =>
                documentHost
                  .current()
                  .history.execute(
                    new SetTumbleChoreographyCommand({ ...scene.tumble, [field]: value }),
                  ),
              )
            }
          />
        ))}
      </Group>
    </div>
  );
}

function SlotGridEditor({ grid }: { grid: GridConfig }): ReactElement {
  const { error, run } = useAuthoringError();
  const set = (next: GridConfig) =>
    run(() => documentHost.current().history.execute(new SetGridConfigCommand(next)));
  return (
    <Group title="Grid and reel timing" open>
      {error}
      <div className="authoring-actions">
        {[
          SetGridConfigCommand.reelStrip5x3,
          SetGridConfigCommand.scatterPay6x5,
          SetGridConfigCommand.cluster7x7,
        ].map((build, index) => (
          <button
            key={index}
            type="button"
            onClick={() => run(() => documentHost.current().history.execute(build()))}
          >
            {['5 x 3 reels', '6 x 5 scatter', '7 x 7 cluster'][index]}
          </button>
        ))}
      </div>
      <ChoiceInput
        label="Topology"
        value={grid.topology}
        choices={['reelStrip', 'scatterPay', 'cluster']}
        onChange={(topology) =>
          set({
            ...grid,
            topology,
            ...(topology === 'cluster'
              ? { rows: grid.cols, gravity: 'cluster-down' }
              : { gravity: 'column-down' }),
          })
        }
      />
      {(['cols', 'rows', 'cellWidth', 'cellHeight', 'cellGap', 'reelStopStaggerMs'] as const).map(
        (field) => (
          <NumberInput
            key={field}
            label={field}
            value={grid[field]}
            min={field === 'cellGap' || field === 'reelStopStaggerMs' ? 0 : 1}
            {...(field === 'cols' || field === 'rows' ? { max: 12 } : {})}
            step={1}
            onChange={(value) =>
              set({
                ...grid,
                [field]: value,
                ...(grid.topology === 'cluster' && (field === 'cols' || field === 'rows')
                  ? { rows: value, cols: value }
                  : {}),
              })
            }
          />
        ),
      )}
      <TextInput
        label="Anticipation symbols (comma separated)"
        value={grid.anticipation.triggerSymbols.join(', ')}
        onChange={(value) =>
          set({
            ...grid,
            anticipation: {
              ...grid.anticipation,
              triggerSymbols: [
                ...new Set(
                  value
                    .split(',')
                    .map((v) => v.trim())
                    .filter(Boolean),
                ),
              ].map(symbolId),
            },
          })
        }
      />
      {(['thresholdCount', 'maxAnticipatingCols'] as const).map((field) => (
        <NumberInput
          key={field}
          label={field}
          value={grid.anticipation[field]}
          min={1}
          {...(field === 'maxAnticipatingCols' ? { max: grid.cols } : {})}
          step={1}
          onChange={(value) =>
            set({ ...grid, anticipation: { ...grid.anticipation, [field]: value } })
          }
        />
      ))}
    </Group>
  );
}

function SlotSymbolBrowser({ scene }: { scene: SlotSceneState }): ReactElement {
  const [filter, setFilter] = useState('');
  const [symbol, setSymbol] = useState('');
  const [selected, setSelected] = useState('');
  const { error, run } = useAuthoringError();
  const doc = documentHost.current();
  const animations = doc.model.animations().map((animation) => animation.name);
  const entries = Object.entries(scene.symbols);
  const selection = entries.find(([name]) => name === selected);
  const map = (name: string, animSet: SymbolAnimSet) =>
    run(() => {
      const skeleton = exportDocument(doc.model);
      if (animSet.skeletonRef !== skeleton.name)
        throw new Error('Bind this symbol to the current project skeleton to preview it here.');
      doc.history.execute(
        new MapSymbolAnimSetCommand(symbolId(name), {
          animSet,
          skeletonHash: skeleton.hash,
          skeletonAnimationNames: Object.keys(skeleton.animations),
        }),
      );
    });
  return (
    <Group title={`Symbols (${entries.length})`} open>
      {error}
      <label className="authoring-field">
        <span>Find symbol</span>
        <input value={filter} onChange={(e) => setFilter(e.currentTarget.value)} />
      </label>
      <div className="authoring-actions" role="list" aria-label="Mapped symbols">
        {entries
          .filter(([name]) => name.toLowerCase().includes(filter.toLowerCase()))
          .map(([name, set]) => (
            <button
              type="button"
              key={name}
              aria-pressed={selected === name}
              onClick={() => setSelected(name)}
              title={`${set.skeletonRef}: ${set.idle} / ${set.land} / ${set.win}`}
            >
              {name}
            </button>
          ))}
      </div>
      <label className="authoring-field">
        <span>New symbol ID</span>
        <input value={symbol} onChange={(e) => setSymbol(e.currentTarget.value)} />
      </label>
      <button
        type="button"
        disabled={
          !symbol.trim() || !animations.length || entries.some(([name]) => name === symbol.trim())
        }
        onClick={() => {
          const name = symbol.trim();
          const animation = animations[0]!;
          map(name, {
            skeletonRef: doc.model.name,
            idle: animation,
            land: animation,
            win: animation,
          });
          setSelected(name);
        }}
      >
        Map project artwork
      </button>
      {!animations.length && <p>Create an animation in this project before mapping a symbol.</p>}
      {selection && (
        <div>
          <p>
            {selection[0]}: {selection[1].skeletonRef}
          </p>
          {selection[1].skeletonRef !== doc.model.name && (
            <button
              type="button"
              onClick={() => map(selection[0], { ...selection[1], skeletonRef: doc.model.name })}
            >
              Bind to project skeleton
            </button>
          )}
          {(['idle', 'land', 'win', 'anticipation'] as const).map((phase) => {
            const value = selection[1][phase] ?? '';
            const choices = [
              ...new Set([
                ...(phase === 'anticipation' ? [''] : []),
                ...animations,
                ...(value ? [value] : []),
              ]),
            ];
            return (
              <ChoiceInput
                key={phase}
                label={phase === 'anticipation' ? 'Anticipation (empty uses win)' : phase}
                value={value}
                choices={choices}
                onChange={(animation) => {
                  const next = { ...selection[1], [phase]: animation };
                  if (phase === 'anticipation' && !animation) delete next.anticipation;
                  map(selection[0], next);
                }}
              />
            );
          })}
          <button
            type="button"
            onClick={() =>
              run(() =>
                doc.history.execute(
                  new MapSymbolAnimSetCommand(symbolId(selection[0]), { animSet: null }),
                ),
              )
            }
          >
            Remove mapping
          </button>
        </div>
      )}
    </Group>
  );
}
