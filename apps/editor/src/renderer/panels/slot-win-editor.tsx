import { useState, type ReactElement } from 'react';
import { symbolId } from '@marionette/format/slot';
import type {
  WinSequenceConfig,
  WinSequenceStep,
  WinStepAction,
  WinTargetRule,
} from '@marionette/format/slot-types';
import { SetWinSequencerCommand } from '../document';
import { ChoiceInput, Group, NumberInput, TextInput, useAuthoringError } from './authoring-fields';
import { executePresentationEdit, ROLLUP_CURVES } from './slot-authoring-support';

export function SlotWinEditor({
  config,
  presets,
  symbols,
}: {
  config: WinSequenceConfig;
  presets: readonly string[];
  symbols: readonly string[];
}): ReactElement {
  const [selected, setSelected] = useState(config.defaultSequence);
  const [draftName, setDraftName] = useState('');
  const { error, run } = useAuthoringError();
  const names = Object.keys(config.sequences);
  const name = Object.hasOwn(config.sequences, selected) ? selected : config.defaultSequence;
  const steps = config.sequences[name]?.steps ?? [];
  const set = (next: WinSequenceConfig, preset?: string) =>
    run(() => executePresentationEdit(new SetWinSequencerCommand(next), preset));
  const setSteps = (next: readonly WinSequenceStep[], preset?: string) =>
    set({ ...config, sequences: { ...config.sequences, [name]: { steps: [...next] } } }, preset);
  const patch = (index: number, step: WinSequenceStep) =>
    setSteps(
      steps.map((prior, i) => (i === index ? step : prior)),
      step.action.kind === 'vfx' ? step.action.preset : undefined,
    );
  const move = (index: number, delta: number) => {
    const next = steps.slice();
    [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
    setSteps(next);
  };
  return (
    <Group title="Win sequences" open>
      {error}
      <ChoiceInput label="Edit sequence" value={name} choices={names} onChange={setSelected} />
      <ChoiceInput
        label="Default sequence"
        value={config.defaultSequence}
        choices={names}
        onChange={(defaultSequence) => set({ ...config, defaultSequence })}
      />
      {(['big', 'mega', 'epic'] as const).map((tier) => (
        <NumberInput
          key={tier}
          label={`${tier} threshold (win / bet)`}
          value={config.thresholds[tier]}
          min={0}
          onChange={(value) =>
            set({ ...config, thresholds: { ...config.thresholds, [tier]: value } })
          }
        />
      ))}
      <label className="authoring-field">
        <span>New sequence name</span>
        <input value={draftName} onChange={(e) => setDraftName(e.currentTarget.value)} />
      </label>
      <button
        type="button"
        disabled={!draftName.trim() || names.includes(draftName.trim())}
        onClick={() => {
          const next = draftName.trim();
          set({ ...config, sequences: { ...config.sequences, [next]: { steps: [] } } });
          setSelected(next);
        }}
      >
        Create sequence
      </button>
      <TextInput
        label="Sequence name"
        value={name}
        onChange={(next) =>
          run(() => {
            if (next !== name && Object.hasOwn(config.sequences, next))
              throw new Error('Sequence name already exists.');
            const sequences = { ...config.sequences };
            delete sequences[name];
            sequences[next] = { steps };
            executePresentationEdit(
              new SetWinSequencerCommand({
                ...config,
                sequences,
                defaultSequence: config.defaultSequence === name ? next : config.defaultSequence,
              }),
            );
            setSelected(next);
          })
        }
      />
      <button
        type="button"
        disabled={names.length < 2}
        onClick={() => {
          const sequences = { ...config.sequences };
          delete sequences[name];
          set({
            ...config,
            sequences,
            defaultSequence:
              config.defaultSequence === name ? Object.keys(sequences)[0]! : config.defaultSequence,
          });
        }}
      >
        Delete sequence
      </button>
      {steps.map((step, index) => (
        <Group
          key={`${name}:${index}`}
          title={`${index + 1}. ${step.atMs} ms: ${step.action.kind}`}
        >
          <NumberInput
            label="Start offset (ms)"
            value={step.atMs}
            min={0}
            step={1}
            onChange={(atMs) => patch(index, { ...step, atMs })}
          />
          <ChoiceInput
            label="Target rule"
            value={step.target.kind}
            choices={['allWinningCells', 'byLine', 'bySymbol']}
            onChange={(kind) => {
              const target: WinTargetRule =
                kind === 'byLine'
                  ? { kind, index: 0 }
                  : kind === 'bySymbol'
                    ? { kind, symbol: symbolId(symbols[0] ?? 'scatter') }
                    : { kind };
              patch(index, { ...step, target });
            }}
          />
          {step.target.kind === 'byLine' && (
            <NumberInput
              label="Line index"
              value={step.target.index}
              min={0}
              step={1}
              onChange={(value) =>
                patch(index, { ...step, target: { kind: 'byLine', index: value } })
              }
            />
          )}
          {step.target.kind === 'bySymbol' && (
            <ChoiceInput
              label="Symbol"
              value={step.target.symbol}
              choices={[...new Set([...symbols, step.target.symbol])]}
              onChange={(symbol) =>
                patch(index, { ...step, target: { kind: 'bySymbol', symbol: symbolId(symbol) } })
              }
            />
          )}
          <ChoiceInput
            label="Action"
            value={step.action.kind}
            choices={
              presets.length
                ? ['animateWin', 'vfx', 'rollupStart', 'escalationBanner']
                : ['animateWin', 'rollupStart', 'escalationBanner']
            }
            onChange={(kind) => {
              const action: WinStepAction =
                kind === 'vfx'
                  ? { kind, preset: presets[0]!, anchorRule: 'eachCell' }
                  : kind === 'rollupStart'
                    ? { kind, curve: 'linear' }
                    : kind === 'escalationBanner'
                      ? { kind, tier: 'big' }
                      : { kind };
              patch(index, { ...step, action });
            }}
          />
          {step.action.kind === 'vfx' && (
            <>
              <ChoiceInput
                label="Effect or bundle"
                value={step.action.preset}
                choices={[...new Set([...presets, step.action.preset])]}
                onChange={(preset) => {
                  if (step.action.kind === 'vfx')
                    patch(index, { ...step, action: { ...step.action, preset } });
                }}
              />
              <ChoiceInput
                label="Anchor"
                value={step.action.anchorRule}
                choices={['eachCell', 'gridCenter']}
                onChange={(anchorRule) => {
                  if (step.action.kind === 'vfx')
                    patch(index, { ...step, action: { ...step.action, anchorRule } });
                }}
              />
            </>
          )}
          {step.action.kind === 'rollupStart' && (
            <ChoiceInput
              label="Counter curve"
              value={step.action.curve}
              choices={ROLLUP_CURVES}
              onChange={(curve) =>
                patch(index, { ...step, action: { kind: 'rollupStart', curve } })
              }
            />
          )}
          {step.action.kind === 'escalationBanner' && (
            <ChoiceInput
              label="Banner tier"
              value={step.action.tier}
              choices={['big', 'mega', 'epic']}
              onChange={(tier) =>
                patch(index, { ...step, action: { kind: 'escalationBanner', tier } })
              }
            />
          )}
          <div className="authoring-actions">
            <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>
              Earlier in order
            </button>
            <button
              type="button"
              disabled={index === steps.length - 1}
              onClick={() => move(index, 1)}
            >
              Later in order
            </button>
            <button type="button" onClick={() => setSteps(steps.filter((_step, i) => i !== index))}>
              Remove step
            </button>
          </div>
        </Group>
      ))}
      <button
        type="button"
        onClick={() =>
          setSteps([
            ...steps,
            {
              atMs: (steps.at(-1)?.atMs ?? -250) + 250,
              target: { kind: 'allWinningCells' },
              action: { kind: 'animateWin' },
            },
          ])
        }
      >
        Add win step
      </button>
    </Group>
  );
}
