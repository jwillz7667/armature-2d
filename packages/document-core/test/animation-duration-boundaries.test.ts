import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDocument, type Animation } from '@marionette/format';
import {
  AnimationDurationError,
  CreateAnimationCommand,
  SetAnimationDurationCommand,
  exportDocument,
  loadDocument,
} from '../src';
import { makeTestEnv, seeds } from './seeds';

// Exercise the command against each real timeline family in the shared rig corpus, isolated from
// bone keys which previously hid missing guards. Format validation supplies the independent oracle.
const cases: { name: string; document: unknown }[] = [];

it('requires positive duration even when all keys are at time zero', () => {
  const seed = seeds.animated;
  const source = Object.values(seed.animations)[0]!;
  const root = seed.bones[0]!.name;
  const animation: Animation = {
    ...source,
    bones: { [root]: { rotate: [{ time: 0, value: { angle: 15 }, curve: 'linear' }] } },
    slots: {},
  };
  const doc = loadDocument({ ...seed, animations: { zero: animation } }, makeTestEnv().env);
  const id = doc.model.animations()[0]!.id;
  const before = doc.model.snapshot();
  expect(() => doc.history.execute(new SetAnimationDurationCommand(id, 0))).toThrow(
    AnimationDurationError,
  );
  expect(doc.model.snapshot()).toEqual(before);
  expect(doc.history.canUndo).toBe(false);
});
const directory = new URL('../../conformance/src/rigs/', import.meta.url);
for (const file of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
  const rig = parseDocument(JSON.parse(readFileSync(new URL(file, directory), 'utf8')), {
    verifyHash: false,
  });
  for (const [name, animation] of Object.entries(rig.animations)) {
    for (const [family, value] of Object.entries(animation)) {
      if (family === 'duration' || family === 'bones' || family === 'slots') continue;
      const isolated: Animation = {
        duration: animation.duration,
        bones: {},
        slots: {},
        ik: {},
        transform: {},
        deform: {},
        events: [],
        drawOrder: [],
        path: {},
        physics: {},
        [family]: value,
      };
      const hasLaterKey = JSON.stringify(value).match(/"time":(?!0(?:[,}]))[\d.]+/);
      if (hasLaterKey)
        cases.push({
          name: `${file}/${name}/${family}`,
          document: { ...rig, animations: { [name]: isolated } },
        });
    }
    for (const family of ['bones', 'slots'] as const) {
      for (const [target, channels] of Object.entries(animation[family])) {
        for (const [channel, frames] of Object.entries(channels)) {
          if (!frames.some((frame: { time: number }) => frame.time > 0)) continue;
          const isolated: Animation = {
            duration: animation.duration,
            bones: {},
            slots: {},
            ik: {},
            transform: {},
            deform: {},
            events: [],
            drawOrder: [],
            path: {},
            physics: {},
            [family]: { [target]: { [channel]: frames } },
          };
          cases.push({
            name: `${file}/${name}/${family}/${channel}`,
            document: { ...rig, animations: { [name]: isolated } },
          });
        }
      }
    }
  }
}

describe('complete animation duration boundary', () => {
  it.each(cases)('rejects truncating $name', ({ document }) => {
    const doc = loadDocument(document, makeTestEnv().env);
    const animation = doc.model.animations()[0]!;
    const before = doc.model.snapshot();
    expect(() => doc.history.execute(new SetAnimationDurationCommand(animation.id, 0))).toThrow(
      AnimationDurationError,
    );
    expect(doc.model.snapshot()).toEqual(before);
    expect(doc.history.canUndo).toBe(false);
    doc.history.execute(new SetAnimationDurationCommand(animation.id, animation.duration + 1));
    doc.history.execute(new SetAnimationDurationCommand(animation.id, animation.duration + 2));
    exportDocument(doc.model);
    doc.history.undo();
    expect(doc.model.snapshot()).toEqual(before);
    expect(doc.history.canUndo).toBe(false);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid durations %s on create and edit',
    (duration) => {
      const doc = loadDocument(seeds.animated, makeTestEnv().env);
      const before = doc.model.snapshot();
      expect(() =>
        doc.history.execute(
          new SetAnimationDurationCommand(doc.model.animations()[0]!.id, duration),
        ),
      ).toThrow(AnimationDurationError);
      expect(() =>
        doc.history.execute(
          new CreateAnimationCommand(doc.ids.mint('animation'), 'invalid', duration),
        ),
      ).toThrow(AnimationDurationError);
      expect(doc.model.snapshot()).toEqual(before);
      expect(doc.history.canUndo).toBe(false);
    },
  );
});
