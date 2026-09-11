import { parseCurve } from '../curve';
import type { Diagnostics } from '../diagnostics';
import { asArray, asRecord, ptr, readNumber, type JsonRecord } from '../read';
import { warnUnknownFields } from '../unsupported-fields';

// Armature filters absent channels before interpolation. Split path tracks can therefore
// share one sparse list, provided coincident keys agree on the outgoing curve.
export function pathFrames(value: unknown, base: string, diag: Diagnostics): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  const record = asRecord(value, base, diag);
  if (!record) return undefined;
  warnUnknownFields(record, ['position', 'spacing', 'mix'], base, diag);
  const frames = new Map<number, JsonRecord>();
  const curves = new Map<number, string>();
  for (const type of ['position', 'spacing', 'mix']) {
    if (record[type] === undefined) continue;
    const path = ptr(base, type);
    const list = asArray(record[type], path, diag);
    if (!list) continue;
    let previous = -1;
    for (const [i, value] of list.entries()) {
      const keyPath = ptr(path, i);
      const key = asRecord(value, keyPath, diag);
      if (!key) continue;
      const time = readNumber(key, 'time', keyPath, diag, 0);
      if (time < 0 || time <= previous)
        diag.error(
          'SPINE_SCHEMA',
          keyPath,
          'path key times must be non-negative and strictly increasing',
        );
      previous = time;
      const curve = JSON.stringify(parseCurve(key, keyPath, diag));
      if (curves.has(time) && curves.get(time) !== curve)
        diag.error(
          'SPINE_FEATURE_UNSUPPORTED',
          keyPath,
          'Coincident path channels use different outgoing curves; the current joint path key cannot represent both faithfully',
        );
      curves.set(time, curve);
      const frame = frames.get(time) ?? { time };
      const fields = type === 'mix' ? ['rotateMix', 'translateMix'] : [type];
      warnUnknownFields(key, ['time', 'curve', 'c2', 'c3', 'c4', ...fields], keyPath, diag);
      for (const field of fields) frame[field] = readNumber(key, field, keyPath, diag, 1);
      for (const field of ['curve', 'c2', 'c3', 'c4'])
        if (key[field] !== undefined) frame[field] = key[field];
      frames.set(time, frame);
    }
  }
  return [...frames.values()].sort((a, b) => Number(a['time']) - Number(b['time']));
}
