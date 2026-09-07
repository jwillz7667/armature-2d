import { encodePng } from './png';
import {
  renderRgbaSequence,
  type RenderSequenceOptions,
  type RgbaSequenceFrame,
  type RenderedRgbaSequence,
} from './render-sequence-core';
export type {
  RenderSequenceOptions,
  SingleAnimationSequenceOptions,
  AnimationStateSequenceOptions,
  SequenceBaseOptions,
  SequenceBound,
  SequenceEffect,
} from './render-sequence-core';

export interface SequenceFrame extends RgbaSequenceFrame {
  png(): Uint8Array;
}
export interface RenderedSequence extends Omit<RenderedRgbaSequence, 'frames' | 'forEach'> {
  frames(): Generator<SequenceFrame>;
  forEach(onFrame: (frame: SequenceFrame) => void): void;
}

// PNG is an explicit Node boundary; the browser worker consumes the identical RGBA pipeline through
// the public /browser entry without pulling pngjs, Buffer, stream or zlib into its dependency graph.
export function renderSequence(options: RenderSequenceOptions): RenderedSequence {
  const sequence = renderRgbaSequence(options);
  function* frames(): Generator<SequenceFrame> {
    for (const frame of sequence.frames())
      yield { ...frame, png: () => encodePng(frame.rgba, frame.width, frame.height) };
  }
  return {
    frameCount: sequence.frameCount,
    fps: sequence.fps,
    width: sequence.width,
    height: sequence.height,
    durationSeconds: sequence.durationSeconds,
    frames,
    forEach(onFrame) {
      for (const frame of frames()) onFrame(frame);
    },
  };
}
