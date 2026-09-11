// Browser-safe RGBA rendering. No Node codecs or file operations are reachable from this entry.
export { renderRgbaSequence } from './render-sequence-core';
export type {
  RenderSequenceOptions,
  RgbaSequenceFrame,
  RenderedRgbaSequence,
} from './render-sequence-core';
export type { AtlasPixelSource, AtlasPagePixels } from './atlas';
export { renderEffectRgbaFrame, renderComposedRgbaFrame } from './render-effect-frame-core';
