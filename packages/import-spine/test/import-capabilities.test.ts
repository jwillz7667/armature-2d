import { describe, expect, it } from 'vitest';
import { importSpineJson, importSpineSkel } from '../src';
import { SkelReader } from '../src/binary/reader';
import { encodeSkel } from './fixtures/skel-encoder';
import { pathFrames } from '../src/convert/path-frames';
import { Diagnostics } from '../src/diagnostics';

const setup = {
  skeleton: { spine: '4.1.24' },
  bones: [{ name: 'root' }],
  slots: ['a', 'b', 'c', 'd'].map((name) => ({ name, bone: 'root' })),
};

describe('honest import capability boundaries', () => {
  it('merges documented split path channels without changing their sparse times and refuses conflicting curves', () => {
    const diag = new Diagnostics();
    const frames = pathFrames(
      {
        position: [
          { time: 0, position: 0 },
          { time: 2, position: 1 },
        ],
        mix: [{ time: 0, rotateMix: 0.5, translateMix: 1 }],
        spacing: [{ time: 1, spacing: 0.25 }],
      },
      '/path',
      diag,
    );
    expect(diag.errors).toEqual([]);
    expect(frames).toEqual([
      { time: 0, position: 0, rotateMix: 0.5, translateMix: 1 },
      { time: 1, spacing: 0.25 },
      { time: 2, position: 1 },
    ]);
    pathFrames(
      { position: [{ time: 0, position: 0, curve: 'stepped' }], mix: [{ time: 0, rotateMix: 1 }] },
      '/path',
      diag,
    );
    expect(diag.errors).toEqual([
      expect.objectContaining({ code: 'SPINE_FEATURE_UNSUPPORTED', path: '/path/mix/0' }),
    ]);
  });
  it.each(['4.3.0', '4.99.1', '4.1', '4.1.24beta', '4.anything', ' 4.1.24'])(
    'rejects unknown or malformed version %s',
    (spine) => {
      const result = importSpineJson({ ...setup, skeleton: { spine } });
      expect(result).toMatchObject({
        ok: false,
        errors: [expect.objectContaining({ code: 'SPINE_VERSION_UNSUPPORTED' })],
      });
    },
  );

  it('converts draw-order offsets and setup resets without dropping their duration', () => {
    const result = importSpineJson({
      ...setup,
      animations: {
        order: { drawOrder: [{ time: 0, offsets: [{ slot: 'a', offset: 2 }] }, { time: 2 }] },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.animations['order']).toMatchObject({
      duration: 2,
      drawOrder: [
        {
          time: 0,
          offsets: [
            { slot: 'b', offset: -1 },
            { slot: 'c', offset: -1 },
            { slot: 'a', offset: 2 },
          ],
        },
        { time: 2, offsets: [] },
      ],
    });
  });

  it.each([
    [{ slot: 'missing', offset: 0 }],
    [{ slot: 'a', offset: 4 }],
    [
      { slot: 'a', offset: 1 },
      { slot: 'b', offset: 0 },
    ],
    [
      { slot: 'a', offset: 1 },
      { slot: 'a', offset: 2 },
    ],
  ])('rejects invalid draw order %j', (offsets) => {
    const result = importSpineJson({
      ...setup,
      animations: { order: { draworder: [{ offsets }] } },
    });
    expect(result.ok).toBe(false);
  });

  it('reports unknown timeline fields with escaped source pointers and a static duration notice', () => {
    const result = importSpineJson({
      ...setup,
      animations: {
        'run/fast': { bones: { root: { translatex: [{ value: 5 }] } }, attachments: {} },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.animations['run/fast']?.duration).toBe(1 / 30);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: 'unknown-field',
          path: '/animations/run~1fast/bones/root/translatex',
        }),
        expect.objectContaining({
          feature: 'unknown-field',
          path: '/animations/run~1fast/attachments',
        }),
        expect.objectContaining({ feature: 'static-animation-duration' }),
      ]),
    );
  });

  it('rejects recursive and reserved-key objects without mutating prototypes', () => {
    const cyclic: Record<string, unknown> = { ...setup };
    cyclic['loop'] = cyclic;
    expect(importSpineJson(cyclic).ok).toBe(false);
    expect(
      importSpineJson(JSON.parse('{"skeleton":{"spine":"4.1.24"},"__proto__":{"polluted":true}}'))
        .ok,
    ).toBe(false);
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('requires explicit development opt-in for the unverified binary codec and rejects trailing data', () => {
    const bytes = encodeSkel({ version: '4.1.24', bones: [{ name: 'root' }] });
    expect(importSpineSkel(bytes)).toMatchObject({
      ok: false,
      errors: [
        { code: 'SPINE_BINARY_UNVERIFIED', path: '', message: expect.stringContaining('JSON') },
      ],
    });
    expect(importSpineSkel(bytes, { allowUnverifiedBinary: true }).ok).toBe(true);
    expect(
      importSpineSkel(new Uint8Array([...bytes, 0]), { allowUnverifiedBinary: true }),
    ).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'SPINE_BINARY_INVALID' })],
    });
  });

  it('rejects overflowing varints, noncanonical booleans, and invalid UTF-8 before interpretation', () => {
    expect(() => new SkelReader(new Uint8Array([255, 255, 255, 255, 31])).varint('', true)).toThrow(
      '32 bits',
    );
    expect(() => new SkelReader(new Uint8Array([2])).bool('')).toThrow('0 or 1');
    expect(() => new SkelReader(new Uint8Array([2, 255])).string('')).toThrow('UTF-8');
  });
});
