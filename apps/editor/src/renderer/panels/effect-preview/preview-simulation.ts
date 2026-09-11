import type { EffectsDocument } from '@marionette/format/effects-types';
import { EffectSystem, type EffectAnchor, type Mat2x3 } from '@marionette/runtime-core';

export type EffectPreviewTarget = { readonly kind: 'effect' | 'bundle'; readonly name: string };
export type EffectPreviewMotion = 'still' | 'circle' | 'line';
export const DEFAULT_EFFECT_PREVIEW_SEED = 0x9e3779b1;

// Fixed preview clock and named anchors are presentation inputs. The same target, seed, and step
// sequence reproduces the same particles. No game outcomes or payout logic enter this module.
export function createEffectPreviewSimulation(
  document: EffectsDocument,
  target: EffectPreviewTarget,
  seed: number,
  motion: EffectPreviewMotion,
) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error('Preview seed must be an unsigned 32-bit integer.');
  let time = 0;
  let remainder = 0;
  const anchor: EffectAnchor = {
    space: 'bone',
    skeletonInstanceId: 'preview',
    pointOrBone: 'center',
  };
  const system = new EffectSystem(document, {
    resolveBone: (_instance, role): Mat2x3 => {
      const dx = role === 'left' ? -100 : role === 'right' ? 100 : 0;
      const dy = role === 'top' ? -100 : role === 'bottom' ? 100 : 0;
      const x =
        motion === 'circle'
          ? Math.cos(time * 2) * 70
          : motion === 'line'
            ? Math.sin(time * 2) * 100
            : 0;
      const y = motion === 'circle' ? Math.sin(time * 2) * 70 : 0;
      return [1, 0, 0, 1, x + dx, y + dy];
    },
  });
  if (target.kind === 'effect') system.trigger({ effect: target.name, anchor, seed, startTime: 0 });
  else {
    const definition = document.bundles[target.name];
    if (!definition) throw new Error(`Bundle not found: ${target.name}`);
    const anchors: Record<string, EffectAnchor> = {};
    for (const item of definition.items)
      anchors[item.anchorRole] = {
        space: 'bone',
        skeletonInstanceId: 'preview',
        pointOrBone: item.anchorRole,
      };
    system.triggerBundle(target.name, seed, anchors, 0);
  }
  return {
    system,
    step(dt: number): void {
      if (!Number.isFinite(dt) || dt < 0)
        throw new Error('Preview delta must be finite and nonnegative.');
      remainder += Math.min(dt, 0.25);
      while (remainder + 1e-12 >= 1 / 60) {
        remainder -= 1 / 60;
        time += 1 / 60;
        system.step(1 / 60);
      }
    },
  };
}

export type EffectPreviewSimulation = ReturnType<typeof createEffectPreviewSimulation>;
