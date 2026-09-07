import { useState, type ReactElement } from 'react';
import { documentHost, type BoneId, type SlotId } from '../document';
import { useSelectionStore } from '../editor-state/selection-store';
import { useConstraintSelectionStore } from '../editor-state/constraint-selection-store';
import { useSlotSelectionStore } from '../editor-state/slot-selection-store';
import { useToolStore } from '../editor-state/tool-store';
import { createArtistConstraint, type ConstraintCreation } from './constraint-authoring';

export function ConstraintCreator(): ReactElement {
  const model = documentHost.current().model;
  const bones = model.bones();
  const selected = useSelectionStore((s) => s.selectedBoneIds);
  const [kind, setKind] = useState<ConstraintCreation['kind']>('ik');
  const [name, setName] = useState('');
  const [chain, setChain] = useState<readonly BoneId[]>(selected);
  const [target, setTarget] = useState<BoneId | null>(null);
  const [pathSlot, setPathSlot] = useState<SlotId | null>(null);
  const [error, setError] = useState('');
  const paths = model
    .slots()
    .filter((s) =>
      model.attachments(s.id).some((a) => a.kind === 'path' && a.name === s.attachment),
    );
  const targetId =
    target !== null && model.getBone(target)
      ? target
      : bones.find((b) => !chain.includes(b.id))?.id;
  return (
    <details style={{ padding: 10, borderBottom: '1px solid #39414d' }}>
      <summary style={{ cursor: 'pointer', color: '#8fbcff' }}>Create constraint</summary>
      <form
        style={{ display: 'grid', gap: 8, marginTop: 10 }}
        onSubmit={(event) => {
          event.preventDefault();
          try {
            if (targetId === undefined)
              throw new Error('Create or choose a target bone outside the constrained chain.');
            const result = createArtistConstraint(documentHost.current(), {
              kind,
              name,
              bones: chain,
              targetBone: targetId,
              ...(pathSlot !== null && kind === 'path' ? { pathSlot } : {}),
            });
            useConstraintSelectionStore.getState().select(result.selection);
            if (result.pathSlot !== undefined) {
              useSlotSelectionStore.getState().selectSlot(result.pathSlot);
              useToolStore.getState().setTool('path');
            }
            setName('');
            setError('');
          } catch (problem) {
            setError(problem instanceof Error ? problem.message : 'Cannot create constraint.');
          }
        }}
      >
        <label>
          Type{' '}
          <select
            aria-label="Constraint type"
            value={kind}
            onChange={(e) => {
              const value = e.currentTarget.value;
              if (value === 'ik' || value === 'transform' || value === 'path') setKind(value);
            }}
          >
            <option value="ik">IK limb</option>
            <option value="transform">Transform follow</option>
            <option value="path">Path follower</option>
          </select>
        </label>
        <label>
          Name{' '}
          <input
            required
            aria-label="Constraint name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </label>
        <fieldset style={{ border: '1px solid #39414d', maxHeight: 160, overflow: 'auto' }}>
          <legend>
            Constrained bones {kind === 'ik' ? '(one bone or a parent and child)' : ''}
          </legend>
          <button type="button" onClick={() => setChain(selected)}>
            Use viewport selection
          </button>
          {bones.map((bone) => (
            <label key={bone.id} style={{ display: 'block' }}>
              <input
                type="checkbox"
                checked={chain.includes(bone.id)}
                onChange={(e) =>
                  setChain(
                    e.currentTarget.checked
                      ? [...chain, bone.id]
                      : chain.filter((id) => id !== bone.id),
                  )
                }
              />
              {bone.name}
            </label>
          ))}
        </fieldset>
        {kind === 'path' && (
          <label>
            Path{' '}
            <select
              aria-label="Path source"
              value={pathSlot ?? ''}
              onChange={(e) =>
                setPathSlot(paths.find((p) => p.id === e.currentTarget.value)?.id ?? null)
              }
            >
              <option value="">Create an editable path</option>
              {paths.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {kind === 'path' ? 'Path anchor bone' : 'Target bone'}{' '}
          <select
            aria-label="Constraint target"
            value={targetId ?? ''}
            onChange={(e) =>
              setTarget(bones.find((b) => b.id === e.currentTarget.value)?.id ?? null)
            }
          >
            <option value="" disabled>
              Choose a bone
            </option>
            {bones.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        {kind === 'path' && (
          <small>Drag path points in the viewport. Shift-click adds a curve.</small>
        )}
        {error && (
          <p role="alert" style={{ color: '#ffad9e', margin: 0 }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={bones.length === 0}>
          Create {kind === 'ik' ? 'IK' : kind} constraint
        </button>
      </form>
    </details>
  );
}
