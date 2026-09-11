import type { EffectsDocument } from '@marionette/format/effects-types';
import type { GridConfig } from '@marionette/format/slot-types';
import {
  EffectSystem,
  type EffectAnchor,
  type PresentationTimeline,
} from '@marionette/runtime-core';

// A fixed presentation clock for composed previews. Outcome values are carried by the timeline;
// the seed controls visual effects only. Restart constructs a fresh instance with the same inputs.
export function createSlotPreviewSimulation(
  effects: EffectsDocument,
  timeline: PresentationTimeline,
  grid: GridConfig,
  seed: number,
) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error('Use an unsigned 32-bit preview seed.');
  const system = new EffectSystem(effects);
  const bursts = timeline.directives.filter((directive) => directive.kind === 'vfxBurst');
  let cursor = 0;
  let steps = 0;
  let remainder = 0;
  const triggerDue = (): void => {
    while (cursor < bursts.length && bursts[cursor]!.atMs <= (steps * 1000) / 60 + 1e-9) {
      const event = bursts[cursor++]!;
      const point =
        event.anchor.kind === 'cell'
          ? {
              x: event.anchor.col * (grid.cellWidth + grid.cellGap) + grid.cellWidth / 2,
              y: event.anchor.row * (grid.cellHeight + grid.cellGap) + grid.cellHeight / 2,
            }
          : {
              x:
                (grid.cols * (grid.cellWidth + grid.cellGap)) / 2 -
                grid.cellGap / 2 +
                event.anchor.x,
              y:
                (grid.rows * (grid.cellHeight + grid.cellGap)) / 2 -
                grid.cellGap / 2 +
                event.anchor.y,
            };
      const anchor: EffectAnchor = { space: 'world', ...point, rotation: 0 };
      const eventSeed = (seed ^ Math.imul(event.seq + 1, 0x9e3779b1)) >>> 0;
      if (Object.hasOwn(effects.effects, event.preset))
        system.trigger({ effect: event.preset, anchor, seed: eventSeed, startTime: 0 });
      else if (Object.hasOwn(effects.bundles, event.preset)) {
        const anchors: Record<string, EffectAnchor> = {};
        for (const item of effects.bundles[event.preset]!.items) anchors[item.anchorRole] = anchor;
        system.triggerBundle(event.preset, eventSeed, anchors, 0);
      }
    }
  };
  triggerDue();
  return {
    system,
    get timeMs(): number {
      return (steps * 1000) / 60;
    },
    step(dt: number): void {
      if (!Number.isFinite(dt) || dt < 0)
        throw new Error('Preview delta must be finite and nonnegative.');
      remainder += Math.min(dt, 0.25);
      while (remainder + 1e-12 >= 1 / 60) {
        remainder -= 1 / 60;
        system.step(1 / 60);
        steps++;
        triggerDue();
      }
    },
  };
}

export type SlotPreviewSimulation = ReturnType<typeof createSlotPreviewSimulation>;
