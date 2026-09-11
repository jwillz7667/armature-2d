import { describe, expect, it } from 'vitest';
import {
  loadDocument,
  SetIkKeyframeCommand,
  SetTransformKeyframeCommand,
  SetPathKeyframeCommand,
} from '../src';
import { makeTestEnv, seeds, pathedSeed } from './seeds';

describe('constraint key values and easing', () => {
  it('preserves loaded IK depth on a legacy mix edit and supports explicit depth and easing changes', () => {
    const { env } = makeTestEnv();
    const doc = loadDocument(seeds.rigged, env);
    const anim = doc.model.animations().find((a) => a.name === 'move')!;
    const constraint = doc.model.ikConstraints()[0]!;
    doc.history.execute(
      new SetIkKeyframeCommand(anim.id, constraint.id, 0.5, 0.7, true, 'linear', {
        softness: 8,
        stretch: true,
        compress: true,
      }),
    );
    const before = doc.model.snapshot();
    const read = () =>
      doc.model
        .getAnimation(anim.id)!
        .ik.get(constraint.id)!
        .find((k) => k.time === 0.5)!;
    const old = read();
    doc.history.execute(new SetIkKeyframeCommand(anim.id, constraint.id, 0.5, 0.3, false));
    expect(read()).toEqual({ ...old, mix: 0.3, bendPositive: false });
    doc.history.undo();
    expect(doc.model.snapshot()).toEqual(before);
    doc.history.execute(
      new SetIkKeyframeCommand(anim.id, constraint.id, 0.5, 0.7, true, 'linear', {
        replaceCurve: 'stepped',
        softness: 0,
        stretch: false,
      }),
    );
    expect(read()).toEqual({ ...old, curve: 'stepped', softness: 0, stretch: false });
    doc.history.undo();
    expect(doc.model.snapshot()).toEqual(before);
  });

  it('re-eases a transform key without changing its identity and restores it exactly', () => {
    const { env } = makeTestEnv();
    const doc = loadDocument(seeds.rigged, env);
    const anim = doc.model.animations().find((a) => a.name === 'move')!;
    const [constraintId, frames] = [...anim.transform][0]!;
    const key = frames[0]!;
    const before = doc.model.snapshot();
    doc.history.execute(
      new SetTransformKeyframeCommand(anim.id, constraintId, key.time, key, 'linear', {
        replaceCurve: 'stepped',
      }),
    );
    expect(doc.model.getAnimation(anim.id)!.transform.get(constraintId)![0]).toEqual({
      ...key,
      curve: 'stepped',
    });
    doc.history.undo();
    expect(doc.model.snapshot()).toEqual(before);
  });

  it('keeps path key identity while replacing easing, with exact undo', () => {
    const { env } = makeTestEnv();
    const doc = loadDocument(pathedSeed, env);
    const animation = doc.model.animations().find((a) => a.path.size > 0)!;
    const [constraintId, frames] = [...animation.path][0]!;
    const key = frames[0]!;
    const before = doc.model.snapshot();
    doc.history.execute(
      new SetPathKeyframeCommand(animation.id, constraintId, key.time, key, 'linear', {
        replaceCurve: 'stepped',
      }),
    );
    expect(doc.model.getAnimation(animation.id)!.path.get(constraintId)![0]).toEqual({
      ...key,
      curve: 'stepped',
    });
    doc.history.undo();
    expect(doc.model.snapshot()).toEqual(before);
  });
});
