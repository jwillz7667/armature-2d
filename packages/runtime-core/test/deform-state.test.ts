import { describe, expect, it } from 'vitest';
import {
  applyAnimationState,
  buildPose,
  crossfadeTo,
  makeAnimationState,
  sampleMeshVerticesWithState,
  setAnimation,
  updateAnimationState,
} from '../src';
import { anim, bone, deformKey, fullDoc, meshAttachment, slot } from './constraint-fixtures';

function fixture() {
  const deform = (x: number) => anim({ deform: { default: { s: { m: [deformKey(0, [x, 0])] } } } });
  const document = fullDoc({
    bones: [bone('b', null, { x: 3, y: 4 })],
    slots: [slot('s', 'b')],
    skins: [
      {
        name: 'default',
        attachments: { s: { m: meshAttachment({ uvs: [0, 0], vertices: [0, 0] }) } },
      },
      {
        name: 'gold',
        attachments: {
          s: {
            linked: {
              type: 'linkedmesh',
              path: 'm',
              parent: 'm',
              skin: 'default',
              timelines: true,
              color: { r: 1, g: 1, b: 1, a: 1 },
            },
          },
        },
      },
    ],
    animations: { low: deform(10), high: deform(30), same: deform(10), empty: anim() },
  });
  const state = makeAnimationState(document);
  const pose = buildPose(document);
  const out = new Float32Array(2);
  const sample = (skin = 'default', name = 'm') => {
    applyAnimationState(state, pose, skin);
    sampleMeshVerticesWithState(state, pose, skin, 's', name, out);
    expect(out[1]).toBe(4);
    return out[0]! - 3;
  };
  return { state, pose, sample };
}

describe('AnimationState deformation (ADR-0016)', () => {
  it('interpolates crossfade endpoints using the outgoing and incoming offsets', () => {
    const { state, sample } = fixture();
    setAnimation(state, 0, 'low', true);
    crossfadeTo(state, 0, 'high', true, 1);
    expect(sample()).toBe(10);
    updateAnimationState(state, 0.5);
    expect(sample()).toBe(20);
    updateAnimationState(state, 0.5);
    expect(sample()).toBe(30);
  });
  it('does not dip when crossfading two identical deformation channels', () => {
    const { state, sample } = fixture();
    setAnimation(state, 0, 'low', true);
    crossfadeTo(state, 0, 'same', true, 1);
    for (let i = 0; i < 5; i += 1) {
      expect(sample()).toBe(10);
      updateAnimationState(state, 0.25);
    }
  });
  it('fades a missing incoming channel back to the lower layer', () => {
    const { state, sample } = fixture();
    setAnimation(state, 0, 'low', true);
    setAnimation(state, 1, 'high', true);
    crossfadeTo(state, 1, 'empty', true, 1);
    expect(sample()).toBe(30);
    updateAnimationState(state, 0.5);
    expect(sample()).toBe(20);
    updateAnimationState(state, 0.5);
    expect(sample()).toBe(10);
  });
  it('composes replacement and additive layers with independent alpha and masks', () => {
    const { state, sample } = fixture();
    setAnimation(state, 0, 'low', true);
    const top = setAnimation(state, 2, 'high', true);
    top.alpha = 0.5;
    expect(sample()).toBe(20);
    top.additive = true;
    expect(sample()).toBe(25);
    top.deformSlots = [];
    expect(sample()).toBe(10);
    top.deformSlots = ['s'];
    expect(sample('gold', 'linked')).toBe(25);
  });
  it('retains the outgoing entry alpha, additive rule and mask during its fade', () => {
    const { state, sample } = fixture();
    setAnimation(state, 0, 'low', true);
    const outgoing = setAnimation(state, 1, 'high', true);
    outgoing.alpha = 0.5;
    outgoing.additive = true;
    const incoming = crossfadeTo(state, 1, 'high', true, 1);
    incoming.deformSlots = [];
    expect(sample()).toBe(25);
    updateAnimationState(state, 0.5);
    expect(sample()).toBe(17.5);
    updateAnimationState(state, 0.5);
    expect(sample()).toBe(10);
  });
  it('supports an empty base track and reuses all deform buffers after warmup', () => {
    const { state, pose, sample } = fixture();
    setAnimation(state, 3, 'low', true);
    expect(sample()).toBe(10);
    const { offsets, mixed, outgoing } = pose.deformScratch;
    crossfadeTo(state, 3, 'high', true, 1);
    updateAnimationState(state, 0.5);
    expect(sample()).toBe(20);
    expect(pose.deformScratch.offsets).toBe(offsets);
    expect(pose.deformScratch.mixed).toBe(mixed);
    expect(pose.deformScratch.outgoing).toBe(outgoing);
  });
  it.each([NaN, Infinity, -0.1, 1.1])('rejects invalid alpha %s', (alpha) => {
    const { state, sample } = fixture();
    setAnimation(state, 0, 'low', true).alpha = alpha;
    expect(() => sample()).toThrow(/alpha/);
  });
});
