import { describe, expect, it } from 'vitest';
import { renderRgbaSequence } from '../src/browser';
import { renderSequence } from '../src';
import { clipSequenceOptions } from './media-scenarios';

describe('browser-safe sequence renderer', () => {
  it('produces identical pixels through the browser and PNG-capable entry points', () => {
    const browser = renderRgbaSequence(clipSequenceOptions());
    const node = renderSequence(clipSequenceOptions());
    const expected = Array.from(node.frames(), (frame) => new Uint8Array(frame.rgba));
    expect(Array.from(browser.frames(), (frame) => new Uint8Array(frame.rgba))).toEqual(expected);
    expect(browser.frameCount).toBe(node.frameCount);
  });
});
