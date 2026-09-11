import { encodePng } from './png';
import {
  renderEffectRgbaFrame,
  renderComposedRgbaFrame,
  type RenderEffectFrameOptions,
  type RenderComposedFrameOptions,
} from './render-effect-frame-core';
import type { RenderFrameResult } from './render-frame';
export type {
  RenderEffectFrameOptions,
  RenderComposedFrameOptions,
  EffectFrameTrigger,
  EffectAnchorInput,
} from './render-effect-frame-core';
export {
  solveEffectFrame,
  rasterizeEffectItem,
  addWorldItemBounds,
} from './render-effect-frame-core';

export function renderEffectFrame(options: RenderEffectFrameOptions): RenderFrameResult {
  const frame = renderEffectRgbaFrame(options);
  return {
    width: frame.width,
    height: frame.height,
    png: encodePng(frame.rgba, frame.width, frame.height),
  };
}
export function renderComposedFrame(options: RenderComposedFrameOptions): RenderFrameResult {
  const frame = renderComposedRgbaFrame(options);
  return {
    width: frame.width,
    height: frame.height,
    png: encodePng(frame.rgba, frame.width, frame.height),
  };
}
