import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '@marionette/format';
import { renderRgbaSequence, type RenderSequenceOptions } from '../src/browser';
import { clipAtlas, clipSequenceOptions, spinDocument } from './media-scenarios';

const pixels = (options: RenderSequenceOptions): Uint8Array[] =>
  Array.from(renderRgbaSequence(options).frames(), (frame) => new Uint8Array(frame.rgba));

describe('complete skeletal export context', () => {
  it('uses the selected skin and preserves default attachment fallback', () => {
    const doc = parseDocument(spinDocument(), { verifyHash: false });
    const base = doc.skins[0]!;
    const entries = Object.entries(base.attachments);
    const [slotName, attachments] = entries[0]!;
    const [name, attachment] = Object.entries(attachments)[0]!;
    if (attachment.type !== 'region') throw new Error('Test expects a region fixture');
    const variant = {
      ...doc,
      skins: [
        ...doc.skins,
        {
          name: 'alt',
          attachments: {
            [slotName]: {
              [name]: {
                ...attachment,
                width: attachment.width / 2,
                color: { r: 1, g: 0, b: 0, a: 1 },
              },
            },
          },
        },
        { name: 'fallback', attachments: {} },
      ],
    };
    const options = { ...clipSequenceOptions(), document: variant };
    expect(pixels({ ...options, activeSkin: 'alt' })).not.toEqual(pixels(options));
    expect(pixels({ ...options, activeSkin: 'fallback' })).toEqual(pixels(options));
    expect(() => pixels({ ...options, activeSkin: 'missing' })).toThrow(/unknown skin/);
  });
  it('warms physics identically for full and ranged exports', () => {
    const physics = parseDocument(
      JSON.parse(
        readFileSync(
          new URL('../../conformance/src/rigs/rig-physics-swing.json', import.meta.url),
          'utf8',
        ),
      ),
      { verifyHash: false },
    );
    const art = parseDocument(spinDocument(), { verifyHash: false });
    const doc = {
      ...physics,
      slots: art.slots.map((slot) => ({ ...slot, bone: 'prop' })),
      skins: art.skins,
      atlas: art.atlas,
    };
    const options: RenderSequenceOptions = {
      document: doc,
      animation: 'sway',
      atlas: clipAtlas(),
      viewport: { width: 160, height: 64, fit: { x: -100, y: -150, w: 1800, h: 400 } },
      fps: 60,
      to: { frame: 30 },
    };
    const full = pixels(options);
    const expectSameFrames = (actual: Uint8Array[], expected: Uint8Array[]): void => {
      expect(actual.length).toBe(expected.length);
      actual.forEach((frame, index) => {
        expect(Buffer.compare(frame, expected[index]!), `frame ${index}`).toBe(0);
      });
    };
    expectSameFrames(pixels({ ...options, from: { frame: 7 } }), full.slice(7));
    expectSameFrames(pixels(options), full);
    expect(
      pixels({
        ...options,
        document: {
          ...doc,
          physicsConstraints: [],
          animations: Object.fromEntries(
            Object.entries(doc.animations).map(([name, animation]) => [
              name,
              { ...animation, physics: {} },
            ]),
          ),
        },
      }),
    ).not.toEqual(full);
  });
});
