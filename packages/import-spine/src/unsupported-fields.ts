import type { Diagnostics } from './diagnostics';
import { isRecord, ptr, type JsonRecord } from './read';

export function warnUnknownFields(
  rec: JsonRecord,
  allowed: readonly string[],
  path: string,
  diag: Diagnostics,
): void {
  const known = new Set(allowed);
  for (const key of Object.keys(rec))
    if (!known.has(key))
      diag.warn(
        'unknown-field',
        ptr(path, key),
        `The field "${key}" is not converted by this import profile.`,
      );
}

// Bound graph traversal before recursive converters or validation. JSON cannot contain cycles,
// but the public API accepts unknown JS values, so reject those as well as unsafe record names.
export function validateInputBudget(input: unknown, diag: Diagnostics): boolean {
  const pending = [{ value: input, path: '', depth: 0 }];
  const seen = new Set<object>();
  let count = 0;
  while (pending.length) {
    const { value, path, depth } = pending.pop()!;
    if (++count > 1_000_000 || depth > 64) {
      diag.error('SPINE_SCHEMA', path, 'Import exceeds one million values or 64 nesting levels');
      return false;
    }
    if (typeof value === 'string' && value.length > 1_000_000) {
      diag.error('SPINE_SCHEMA', path, 'Import string exceeds one million characters');
      return false;
    }
    if (value === null || typeof value !== 'object') continue;
    if (seen.has(value)) {
      diag.error(
        'SPINE_SCHEMA',
        path,
        'Input must be a JSON tree without shared or cyclic objects',
      );
      return false;
    }
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (key.length > 4096) {
        diag.error('SPINE_SCHEMA', path, 'Import object key exceeds 4096 characters');
        return false;
      }
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        diag.error('SPINE_SCHEMA', ptr(path, key), 'Reserved object key is not allowed');
        return false;
      }
      pending.push({ value: child, path: ptr(path, key), depth: depth + 1 });
    }
  }
  return true;
}

export function reportUnhandledSetup(input: unknown, diag: Diagnostics): void {
  if (!isRecord(input)) return;
  warnUnknownFields(
    input,
    [
      'skeleton',
      'bones',
      'slots',
      'skins',
      'ik',
      'transform',
      'path',
      'physics',
      'events',
      'animations',
    ],
    '',
    diag,
  );
  const lists: Record<string, readonly string[]> = {
    bones: [
      'name',
      'parent',
      'length',
      'transform',
      'skin',
      'x',
      'y',
      'rotation',
      'scaleX',
      'scaleY',
      'shearX',
      'shearY',
      'color',
    ],
    slots: ['name', 'bone', 'color', 'dark', 'attachment', 'blend'],
    ik: [
      'name',
      'order',
      'skin',
      'bones',
      'target',
      'mix',
      'softness',
      'bendPositive',
      'compress',
      'stretch',
      'uniform',
    ],
    transform: [
      'name',
      'order',
      'skin',
      'bones',
      'bone',
      'target',
      'rotation',
      'x',
      'y',
      'scaleX',
      'scaleY',
      'shearY',
      'local',
      'relative',
      'rotateMix',
      'translateMix',
      'scaleMix',
      'shearMix',
    ],
    path: [
      'name',
      'order',
      'skin',
      'bones',
      'target',
      'positionMode',
      'spacingMode',
      'rotateMode',
      'rotation',
      'position',
      'spacing',
      'rotateMix',
      'translateMix',
    ],
  };
  for (const [field, allowed] of Object.entries(lists)) {
    const values = input[field];
    if (Array.isArray(values))
      for (const [i, value] of values.entries())
        if (isRecord(value)) warnUnknownFields(value, allowed, ptr(ptr('', field), i), diag);
  }
}
