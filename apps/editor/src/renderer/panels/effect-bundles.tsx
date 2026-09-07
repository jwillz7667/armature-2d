import { useState, type ReactElement } from 'react';
import {
  AddBundleItemCommand,
  CreateBundleCommand,
  DeleteBundleCommand,
  RemoveBundleItemCommand,
  ReorderBundleItemsCommand,
  SetBundleItemCommand,
  documentHost,
  type BundleEntity,
} from '../document';
import { Group, NumberInput, TextInput, useAuthoringError } from './authoring-fields';

export function EffectBundles({ onPreview }: { onPreview: (name: string) => void }): ReactElement {
  const doc = documentHost.current();
  const bundles = doc.effects.bundles();
  const [selected, setSelected] = useState<string>('');
  const [name, setName] = useState('');
  const { error, run } = useAuthoringError();
  const bundle = bundles.find((b) => b.name === selected) ?? bundles[0];
  return (
    <Group title="Reusable bundles">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(() => {
            const next = name.trim();
            doc.history.execute(new CreateBundleCommand(next));
            setSelected(next);
            setName('');
          });
        }}
        style={{ display: 'flex', gap: 6 }}
      >
        <input
          aria-label="New bundle name"
          required
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Bundle name"
          style={{ minWidth: 0 }}
        />
        <button type="submit">Create</button>
      </form>
      {error}
      {bundle && (
        <>
          <label className="authoring-field">
            Bundle{' '}
            <select value={bundle.name} onChange={(e) => setSelected(e.currentTarget.value)}>
              {bundles.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => onPreview(bundle.name)}>
              Preview bundle
            </button>
            <button
              type="button"
              onClick={() => run(() => doc.history.execute(new DeleteBundleCommand(bundle.name)))}
            >
              Delete bundle
            </button>
          </div>
          <BundleItems bundle={bundle} />
        </>
      )}
    </Group>
  );
}

function BundleItems({ bundle }: { bundle: BundleEntity }): ReactElement {
  const { error, run } = useAuthoringError();
  const effects = documentHost.current().effects.effects();
  const reorder = (index: number, delta: number) =>
    run(() => {
      const order = [...bundle.itemOrder];
      const to = index + delta;
      if (to < 0 || to >= order.length) return;
      [order[index], order[to]] = [order[to]!, order[index]!];
      documentHost.current().history.execute(new ReorderBundleItemsCommand(bundle.name, order));
    });
  return (
    <div>
      {error}
      <small>
        Start times are relative to the bundle trigger. Preview positions support center, left,
        right, top, and bottom; custom roles preview at center.
      </small>
      {bundle.itemOrder.map((id, index) => {
        const item = bundle.items.get(id)!;
        const set = (patch: ConstructorParameters<typeof SetBundleItemCommand>[2]) =>
          run(() =>
            documentHost
              .current()
              .history.execute(new SetBundleItemCommand(bundle.name, id, patch)),
          );
        return (
          <Group
            key={id}
            title={`${index + 1}. ${effects.find((e) => e.id === item.effect)?.name ?? 'Missing effect'}`}
          >
            <label className="authoring-field">
              Effect{' '}
              <select
                value={item.effect}
                onChange={(event) => {
                  const effect = effects.find((e) => e.id === event.currentTarget.value);
                  if (effect) set({ effect: effect.id });
                }}
              >
                {effects.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <NumberInput
              label="Start (seconds)"
              value={item.startOffset}
              min={0}
              onChange={(startOffset) => set({ startOffset })}
            />
            <TextInput
              label="Anchor role"
              value={item.anchorRole}
              onChange={(anchorRole) => set({ anchorRole })}
            />
            <NumberInput
              label="Seed salt"
              value={item.seedSalt}
              step={1}
              min={-2147483648}
              max={4294967295}
              onChange={(seedSalt) => set({ seedSalt })}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" disabled={index === 0} onClick={() => reorder(index, -1)}>
                Earlier
              </button>
              <button
                type="button"
                disabled={index === bundle.itemOrder.length - 1}
                onClick={() => reorder(index, 1)}
              >
                Later
              </button>
              <button
                type="button"
                onClick={() =>
                  run(() =>
                    documentHost
                      .current()
                      .history.execute(new RemoveBundleItemCommand(bundle.name, id)),
                  )
                }
              >
                Remove
              </button>
            </div>
          </Group>
        );
      })}
      <button
        type="button"
        disabled={effects.length === 0}
        onClick={() =>
          run(() => {
            const effect = effects[0];
            if (effect)
              documentHost
                .current()
                .history.execute(
                  new AddBundleItemCommand(bundle.name, {
                    effect: effect.id,
                    startOffset: 0,
                    anchorRole: 'center',
                    seedSalt: bundle.itemOrder.length,
                  }),
                );
          })
        }
      >
        Add effect to bundle
      </button>
    </div>
  );
}
