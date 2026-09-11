import type { DrawOrderKeyframe } from '@marionette/format';
import type { Diagnostics } from '../diagnostics';
import { asArray, asRecord, ptr, readNumber, readRequiredString } from '../read';

// Clean-room mapping of the public JSON format's setup-index offsets. Explicitly moved
// slots occupy their destinations; unspecified slots retain their relative setup order.
// Emit every changed slot so Armature's full-permutation validator sees no collisions.
export function convertDrawOrder(
  value: unknown,
  base: string,
  slots: readonly string[],
  diag: Diagnostics,
): DrawOrderKeyframe[] {
  if (value === undefined) return [];
  const frames = asArray(value, base, diag);
  if (!frames) return [];
  const indices = new Map(slots.map((name, i) => [name, i]));
  const result: DrawOrderKeyframe[] = [];
  for (const [index, raw] of frames.entries()) {
    const path = ptr(base, index);
    const frame = asRecord(raw, path, diag);
    if (!frame) continue;
    const time = readNumber(frame, 'time', path, diag, 0);
    const offsets =
      frame['offsets'] === undefined ? [] : asArray(frame['offsets'], ptr(path, 'offsets'), diag);
    if (!offsets) continue;
    const order: Array<number | undefined> = new Array(slots.length);
    const moved = new Set<number>();
    let valid = true;
    for (const [i, rawOffset] of offsets.entries()) {
      const offsetPath = ptr(ptr(path, 'offsets'), i);
      const entry = asRecord(rawOffset, offsetPath, diag);
      if (!entry) {
        valid = false;
        continue;
      }
      const slot = readRequiredString(entry, 'slot', offsetPath, diag);
      const amount = readNumber(entry, 'offset', offsetPath, diag, 0);
      const from = slot === undefined ? undefined : indices.get(slot);
      const to = from === undefined ? -1 : from + amount;
      if (
        from === undefined ||
        !Number.isInteger(amount) ||
        to < 0 ||
        to >= slots.length ||
        moved.has(from) ||
        order[to] !== undefined
      ) {
        diag.error(
          'SPINE_SCHEMA',
          offsetPath,
          'draw-order offset has an unknown/duplicate slot, colliding destination, or out-of-bounds target',
        );
        valid = false;
        continue;
      }
      moved.add(from);
      order[to] = from;
    }
    if (!valid) continue;
    const remaining = slots.map((_, i) => i).filter((i) => !moved.has(i));
    let cursor = 0;
    for (let i = 0; i < order.length; i += 1)
      if (order[i] === undefined) order[i] = remaining[cursor++];
    result.push({
      time,
      offsets: order.flatMap((from, to) =>
        from === to || from === undefined ? [] : [{ slot: slots[from]!, offset: to - from }],
      ),
    });
  }
  return result;
}
