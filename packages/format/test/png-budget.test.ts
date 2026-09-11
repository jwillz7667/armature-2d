import { describe, expect, it } from 'vitest';
import { inspectPng } from '../src';

function header(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(45);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  view.setUint32(12, 0x49484452);
  view.setUint32(16, width);
  view.setUint32(20, height);
  view.setUint32(37, 0x49454e44);
  return bytes;
}
describe('PNG allocation preflight', () => {
  it('rejects allocation bombs before decoding or requiring valid compressed bytes', () => {
    expect(() => inspectPng(header(0xffffffff, 0xffffffff))).toThrow('64 million');
    expect(() => inspectPng(header(16384, 16384))).toThrow('64 million');
    expect(() => inspectPng(header(0, 10))).toThrow();
    expect(inspectPng(header(2, 3))).toEqual({ width: 2, height: 3 });
  });
  it('rejects truncated chunks and dimensions that a duplicate header could override', () => {
    const duplicate = new Uint8Array(78);
    const original = header(2, 3);
    duplicate.set(original.subarray(0, 33));
    duplicate.set(original.subarray(8, 33), 33);
    duplicate.set(original.subarray(33), 58);
    expect(() => inspectPng(duplicate)).toThrow('Duplicate');
    expect(() => inspectPng(original.subarray(0, 34))).toThrow('Truncated');
  });
});
