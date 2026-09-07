import { useState, type ReactElement } from 'react';
import type { CurveType } from '@marionette/format/types';
import {
  documentHost,
  DeleteIkConstraintCommand,
  DeleteTransformConstraintCommand,
  DeletePathConstraintCommand,
  DeleteIkKeyframeCommand,
  DeleteTransformKeyframeCommand,
  DeletePathKeyframeCommand,
  SetIkKeyframeCommand,
  SetTransformKeyframeCommand,
  SetPathKeyframeCommand,
  type AnimationId,
  type KeyframeId,
  type IkConstraintEntity,
  type TransformConstraintEntity,
  type PathConstraintEntity,
} from '../document';
import { usePlaybackStore } from '../editor-state/playback-store';
import { useSelectionStore } from '../editor-state/selection-store';
import { useSlotSelectionStore } from '../editor-state/slot-selection-store';
import { useToolStore } from '../editor-state/tool-store';
import type { ConstraintSelection } from '../editor-state/constraint-selection-store';

type Definition =
  | { kind: 'ik'; value: IkConstraintEntity }
  | { kind: 'transform'; value: TransformConstraintEntity }
  | { kind: 'path'; value: PathConstraintEntity };
type Key = { readonly id: KeyframeId; readonly time: number; readonly curve: CurveType };

export function ConstraintTimelineEditor({
  selection,
}: {
  selection: ConstraintSelection;
}): ReactElement | null {
  const doc = documentHost.current();
  const model = doc.model;
  const playback = usePlaybackStore();
  let definition: Definition | undefined;
  if (selection.kind === 'ik') {
    const value = model.ikConstraints().find((c) => c.id === selection.id);
    if (value) definition = { kind: 'ik', value };
  } else if (selection.kind === 'transform') {
    const value = model.transformConstraints().find((c) => c.id === selection.id);
    if (value) definition = { kind: 'transform', value };
  } else if (selection.kind === 'path') {
    const value = model.pathConstraints().find((c) => c.id === selection.id);
    if (value) definition = { kind: 'path', value };
  }
  if (!definition) return null;
  const selected = definition;
  const animation =
    playback.activeAnimation === null ? undefined : model.getAnimation(playback.activeAnimation);
  const time = animation
    ? Math.min(
        animation.duration,
        Math.max(0, Math.round(playback.playhead * playback.workingFps) / playback.workingFps),
      )
    : 0;
  const keys: readonly Key[] =
    animation === undefined
      ? []
      : selected.kind === 'ik'
        ? (animation.ik.get(selected.value.id) ?? [])
        : selected.kind === 'transform'
          ? (animation.transform.get(selected.value.id) ?? [])
          : (animation.path.get(selected.value.id) ?? []);
  const key = keys.find((k) => k.time === time);
  const removeKey = (id: KeyframeId) => {
    if (!animation) return;
    doc.history.execute(
      selected.kind === 'ik'
        ? new DeleteIkKeyframeCommand(animation.id, selected.value.id, id)
        : selected.kind === 'transform'
          ? new DeleteTransformKeyframeCommand(animation.id, selected.value.id, id)
          : new DeletePathKeyframeCommand(animation.id, selected.value.id, id),
    );
  };
  const fields: Record<string, number | boolean> =
    selected.kind === 'ik'
      ? {
          mix: selected.value.mix,
          bendPositive: selected.value.bendPositive,
          softness: selected.value.softness,
          stretch: selected.value.stretch,
          compress: selected.value.compress,
        }
      : selected.kind === 'transform'
        ? {
            mixRotate: selected.value.mixRotate,
            mixX: selected.value.mixX,
            mixY: selected.value.mixY,
            mixScaleX: selected.value.mixScaleX,
            mixScaleY: selected.value.mixScaleY,
            mixShearY: selected.value.mixShearY,
          }
        : {
            position: selected.value.position,
            spacing: selected.value.spacing,
            mixRotate: selected.value.mixRotate,
            mixX: selected.value.mixX,
            mixY: selected.value.mixY,
          };
  if (key)
    for (const [name, value] of Object.entries(key))
      if (name in fields && (typeof value === 'number' || typeof value === 'boolean'))
        fields[name] = value;
  return (
    <section
      style={{ padding: 10, borderBlock: '1px solid #39414d', display: 'grid', gap: 8 }}
      aria-label="Constraint animation"
    >
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => {
            if (selected.kind === 'path') {
              useSlotSelectionStore.getState().selectSlot(selected.value.target);
              useToolStore.getState().setTool('path');
            } else {
              useSelectionStore.getState().select([selected.value.target]);
              useSlotSelectionStore.getState().clearSlot();
              useToolStore.getState().setTool('select');
            }
          }}
        >
          Edit target in viewport
        </button>
        <button
          type="button"
          onClick={() =>
            doc.history.execute(
              selected.kind === 'ik'
                ? new DeleteIkConstraintCommand(selected.value.id)
                : selected.kind === 'transform'
                  ? new DeleteTransformConstraintCommand(selected.value.id)
                  : new DeletePathConstraintCommand(selected.value.id),
            )
          }
        >
          Delete constraint
        </button>
      </div>
      <small>Use the Skins panel to limit this constraint to a costume.</small>
      {animation === undefined || animation.duration <= 0 ? (
        <p>Choose an animation with a positive duration to add keys.</p>
      ) : (
        <>
          <strong>
            {animation.name} at {time.toFixed(3)} s
          </strong>
          <KeyEditor
            key={`${documentHost.identity()}:${selected.kind}:${selected.value.id}:${model.revision}:${time}`}
            definition={selected}
            animationId={animation.id}
            time={time}
            fields={fields}
            curve={key?.curve ?? 'linear'}
          />
          {key && (
            <button type="button" onClick={() => removeKey(key.id)}>
              Delete key at playhead
            </button>
          )}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} aria-label="Constraint keys">
            {keys.map((frame) => (
              <button
                type="button"
                key={frame.id}
                title="Jump to key"
                onClick={() => {
                  playback.pause();
                  playback.setPlayhead(frame.time);
                }}
              >
                {frame.time.toFixed(3)} s
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function KeyEditor({
  definition,
  animationId,
  time,
  fields,
  curve,
}: {
  definition: Definition;
  animationId: AnimationId;
  time: number;
  fields: Record<string, number | boolean>;
  curve: CurveType;
}): ReactElement {
  const [curveKind, setCurveKind] = useState(typeof curve === 'string' ? curve : 'bezier');
  const [error, setError] = useState('');
  const bezier = typeof curve === 'string' ? { cx1: 0.25, cy1: 0.1, cx2: 0.25, cy2: 1 } : curve;
  return (
    <form
      style={{ display: 'grid', gap: 6 }}
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const data = new FormData(event.currentTarget);
          const number = (field: string) => {
            const value = Number(data.get(field));
            if (!Number.isFinite(value)) throw new Error(`${field} must be a finite number.`);
            return value;
          };
          const nextCurve: CurveType =
            curveKind === 'linear' || curveKind === 'stepped'
              ? curveKind
              : {
                  type: 'bezier',
                  cx1: number('cx1'),
                  cy1: number('cy1'),
                  cx2: number('cx2'),
                  cy2: number('cy2'),
                };
          const doc = documentHost.current();
          if (definition.kind === 'ik')
            doc.history.execute(
              new SetIkKeyframeCommand(
                animationId,
                definition.value.id,
                time,
                number('mix'),
                data.has('bendPositive'),
                nextCurve,
                {
                  replaceCurve: nextCurve,
                  softness: number('softness'),
                  stretch: data.has('stretch'),
                  compress: data.has('compress'),
                },
              ),
            );
          else if (definition.kind === 'transform')
            doc.history.execute(
              new SetTransformKeyframeCommand(
                animationId,
                definition.value.id,
                time,
                {
                  mixRotate: number('mixRotate'),
                  mixX: number('mixX'),
                  mixY: number('mixY'),
                  mixScaleX: number('mixScaleX'),
                  mixScaleY: number('mixScaleY'),
                  mixShearY: number('mixShearY'),
                },
                nextCurve,
                { replaceCurve: nextCurve },
              ),
            );
          else
            doc.history.execute(
              new SetPathKeyframeCommand(
                animationId,
                definition.value.id,
                time,
                {
                  position: number('position'),
                  spacing: number('spacing'),
                  mixRotate: number('mixRotate'),
                  mixX: number('mixX'),
                  mixY: number('mixY'),
                },
                nextCurve,
                { replaceCurve: nextCurve },
              ),
            );
          setError('');
        } catch (problem) {
          setError(problem instanceof Error ? problem.message : 'Cannot set key.');
        }
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <label key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          {name.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}
          {typeof value === 'boolean' ? (
            <input name={name} type="checkbox" defaultChecked={value} />
          ) : (
            <input
              name={name.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}
              type="number"
              required
              step="any"
              defaultValue={value}
              {...(name.startsWith('mix')
                ? { min: 0, max: 1 }
                : name === 'softness'
                  ? { min: 0 }
                  : {})}
              style={{ width: 90 }}
            />
          )}
        </label>
      ))}
      <label>
        Outgoing curve{' '}
        <select value={curveKind} onChange={(event) => setCurveKind(event.currentTarget.value)}>
          <option value="linear">Linear</option>
          <option value="stepped">Stepped</option>
          <option value="bezier">Bezier</option>
        </select>
      </label>
      {curveKind === 'bezier' &&
        (['cx1', 'cy1', 'cx2', 'cy2'] as const).map((field) => (
          <label key={field}>
            {field}{' '}
            <input
              name={field}
              type="number"
              required
              step="any"
              defaultValue={bezier[field]}
              {...(field.startsWith('cx') ? { min: 0, max: 1 } : {})}
            />
          </label>
        ))}
      {error && <p role="alert">{error}</p>}
      <button type="submit">Set key at playhead</button>
    </form>
  );
}
