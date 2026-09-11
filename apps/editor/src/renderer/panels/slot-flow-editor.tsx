import { useState, type ReactElement } from 'react';
import type {
  FeatureFlowGraph,
  FeatureFlowNode,
  FeatureFlowTransition,
  FeatureMatch,
} from '@marionette/format/slot-types';
import { SetFeatureFlowGraphCommand, documentHost } from '../document';
import {
  ChoiceInput,
  Group,
  NumberInput,
  TextInput,
  ToggleInput,
  useAuthoringError,
} from './authoring-fields';
import { executePresentationEdit } from './slot-authoring-support';

export function SlotFlowEditor({
  graph,
  presets,
}: {
  graph: FeatureFlowGraph;
  presets: readonly string[];
}): ReactElement {
  const [draftName, setDraftName] = useState('');
  const { error, run } = useAuthoringError();
  const names = Object.keys(graph.states);
  const animations = documentHost
    .current()
    .model.animations()
    .map((animation) => animation.name);
  const set = (next: FeatureFlowGraph, preset?: string) =>
    run(() => executePresentationEdit(new SetFeatureFlowGraphCommand(next), preset));
  const node = (name: string, value: FeatureFlowNode) =>
    set({ ...graph, states: { ...graph.states, [name]: value } }, value.cinematic?.vfxPreset);
  const transition = (index: number, value: FeatureFlowTransition) =>
    set({ ...graph, transitions: graph.transitions.map((old, i) => (i === index ? value : old)) });
  return (
    <Group title="Feature and free-spin flow">
      {error}
      <p>
        Entry: base. Transitions consume feature events in the recorded result. Earlier matching
        transitions have priority.
      </p>
      <svg
        role="img"
        aria-label="Feature flow states and directed transitions"
        viewBox={`0 0 320 ${Math.max(70, names.length * 56)}`}
        style={{ width: '100%', maxHeight: 320 }}
      >
        {graph.transitions.map((edge, index) => {
          const from = names.indexOf(edge.from) * 56 + 24;
          const to = names.indexOf(edge.to) * 56 + 24;
          const reach = 240 + (index % 4) * 16;
          return (
            <g key={index}>
              <path
                d={`M230 ${from} C${reach} ${from - 22}, ${reach} ${to + 22}, 230 ${to}`}
                fill="none"
                stroke="#76baff"
              />
              <path d={`M238 ${to - 4} L230 ${to} L238 ${to + 4}`} fill="none" stroke="#76baff" />
            </g>
          );
        })}
        {names.map((name, index) => (
          <g key={name}>
            <rect
              x={10}
              y={index * 56 + 5}
              width={220}
              height={38}
              rx={5}
              fill="#253a54"
              stroke={name === 'base' ? '#ffd36e' : '#6b8bb1'}
            />
            <text x={20} y={index * 56 + 29} fill="white" fontSize={13}>
              {name}
            </text>
          </g>
        ))}
      </svg>
      <label className="authoring-field">
        <span>New state name</span>
        <input value={draftName} onChange={(event) => setDraftName(event.currentTarget.value)} />
      </label>
      <button
        type="button"
        disabled={!draftName.trim() || names.includes(draftName.trim())}
        onClick={() => set({ ...graph, states: { ...graph.states, [draftName.trim()]: {} } })}
      >
        Create state
      </button>
      {names.map((name) => {
        const value = graph.states[name]!;
        return (
          <Group key={name} title={name}>
            {name !== 'base' && (
              <TextInput
                label="State name"
                value={name}
                onChange={(next) =>
                  run(() => {
                    if (next !== name && Object.hasOwn(graph.states, next))
                      throw new Error('State name already exists.');
                    const states = { ...graph.states };
                    delete states[name];
                    states[next] = value;
                    executePresentationEdit(
                      new SetFeatureFlowGraphCommand({
                        ...graph,
                        states,
                        transitions: graph.transitions.map((edge) => ({
                          ...edge,
                          from: edge.from === name ? next : edge.from,
                          to: edge.to === name ? next : edge.to,
                        })),
                      }),
                    );
                  })
                }
              />
            )}
            <ChoiceInput
              label="Cinematic animation (optional)"
              value={value.cinematic?.animation ?? ''}
              choices={[
                ...new Set([
                  '',
                  ...animations,
                  ...(value.cinematic?.animation ? [value.cinematic.animation] : []),
                ]),
              ]}
              onChange={(animation) => {
                const cinematic = { ...value.cinematic };
                if (animation) cinematic.animation = animation;
                else delete cinematic.animation;
                node(name, { cinematic });
              }}
            />
            <ChoiceInput
              label="Cinematic effect or bundle (optional)"
              value={value.cinematic?.vfxPreset ?? ''}
              choices={[
                ...new Set([
                  '',
                  ...presets,
                  ...(value.cinematic?.vfxPreset ? [value.cinematic.vfxPreset] : []),
                ]),
              ]}
              onChange={(preset) => {
                const cinematic = { ...value.cinematic };
                if (preset) cinematic.vfxPreset = preset;
                else delete cinematic.vfxPreset;
                node(name, { cinematic });
              }}
            />
            <button
              type="button"
              disabled={name === 'base'}
              onClick={() => {
                const states = { ...graph.states };
                delete states[name];
                set({
                  ...graph,
                  states,
                  transitions: graph.transitions.filter(
                    (edge) => edge.from !== name && edge.to !== name,
                  ),
                });
              }}
            >
              Delete state and connected transitions
            </button>
          </Group>
        );
      })}
      {graph.transitions.map((edge, index) => (
        <Group key={index} title={`${index + 1}. ${edge.from} → ${edge.to}: ${edge.on.type}`}>
          <ChoiceInput
            label="From"
            value={edge.from}
            choices={names}
            onChange={(from) => transition(index, { ...edge, from })}
          />
          <TextInput
            label="Feature event type"
            value={edge.on.type}
            onChange={(type) => transition(index, { ...edge, on: { ...edge.on, type } })}
          />
          <ChoiceInput
            label="To"
            value={edge.to}
            choices={names}
            onChange={(to) => transition(index, { ...edge, to })}
          />
          <FeaturePredicate match={edge.on} onChange={(on) => transition(index, { ...edge, on })} />
          <div className="authoring-actions">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => {
                const transitions = graph.transitions.slice();
                [transitions[index - 1], transitions[index]] = [
                  transitions[index]!,
                  transitions[index - 1]!,
                ];
                set({ ...graph, transitions });
              }}
            >
              Higher priority
            </button>
            <button
              type="button"
              onClick={() =>
                set({ ...graph, transitions: graph.transitions.filter((_edge, i) => i !== index) })
              }
            >
              Remove transition
            </button>
          </div>
        </Group>
      ))}
      <button
        type="button"
        onClick={() =>
          set({
            ...graph,
            transitions: [
              ...graph.transitions,
              {
                from: 'base',
                to: names.find((name) => name !== 'base') ?? 'base',
                on: { type: 'freeSpinsAwarded' },
              },
            ],
          })
        }
      >
        Add transition
      </button>
    </Group>
  );
}

function FeaturePredicate({
  match,
  onChange,
}: {
  match: FeatureMatch;
  onChange: (match: FeatureMatch) => void;
}): ReactElement {
  const predicate = match.dataEquals;
  const patch = (dataEquals: NonNullable<FeatureMatch['dataEquals']>) =>
    onChange({ ...match, dataEquals });
  return (
    <div>
      <ToggleInput
        label="Match a data field"
        value={predicate !== undefined}
        onChange={(enabled) =>
          onChange(
            enabled
              ? { ...match, dataEquals: { field: 'tier', equals: 'super' } }
              : { type: match.type },
          )
        }
      />
      {predicate && (
        <>
          <TextInput
            label="Field name"
            value={predicate.field}
            onChange={(field) => patch({ ...predicate, field })}
          />
          <ChoiceInput
            label="Value type"
            value={typeof predicate.equals}
            choices={['string', 'number', 'boolean']}
            onChange={(type) =>
              patch({
                ...predicate,
                equals: type === 'number' ? 0 : type === 'boolean' ? true : 'value',
              })
            }
          />
          {typeof predicate.equals === 'number' ? (
            <NumberInput
              label="Equals"
              value={predicate.equals}
              onChange={(equals) => patch({ ...predicate, equals })}
            />
          ) : typeof predicate.equals === 'boolean' ? (
            <ToggleInput
              label="Equals"
              value={predicate.equals}
              onChange={(equals) => patch({ ...predicate, equals })}
            />
          ) : (
            <label className="authoring-field">
              <span>Equals</span>
              <input
                key={predicate.equals}
                defaultValue={predicate.equals}
                onBlur={(event) => patch({ ...predicate, equals: event.currentTarget.value })}
              />
            </label>
          )}
        </>
      )}
    </div>
  );
}
