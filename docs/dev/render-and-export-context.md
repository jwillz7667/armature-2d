# Render and export context

The browser video worker imports `@marionette/render-preview/browser`, which exposes RGBA frames without
Node codecs. Node PNG/GIF/APNG entry points wrap the same raster pipeline. Existing non-physics image
and media byte goldens must remain unchanged when this boundary is refactored.

An exported skeletal clip carries its selected skin, animation, frame range, frame rate, output size
and background. Attachment lookup, linked-mesh resolution, deform lookup, clipping and scoped constraints
use that skin, with default-skin attachment fallback. Sequence counts come from the resolved attachment.

Physics follows the explicit frame delta contract in ADR-0014. Sequence passes start with a fresh pose,
sample time zero with delta zero, and advance at `1 / fps`. A nonzero start range warms the earlier
frames before emitting pixels. Bounds and pixel passes use the same progression. Standalone frame
requests and packaged-player absolute seeks reconstruct physics at 60 Hz. Physics is deterministic for
the same inputs and delta sequence; changing the simulation sampling rate is not a bitwise parity promise.
The packaged player's live update forwards the supplied delta to AnimationState and the physical pose.

Selection and gizmos read the world transforms that produced the displayed viewport frame. A snapshot
is keyed to the document model identity; an unrelated document cannot reuse those transforms.

## Ownership and limits

- Video encoding keeps at most a small codec queue, yields for error/progress handling, and checks codec
  support before encoding. Encoded video is limited to 512 MiB. Cancellation terminates the worker.
- GIF/APNG and PNG sequence rasterization run in a Node worker, keeping Electron's main event loop free
  to handle cancellation. Only one raster export is admitted at a time. A PNG frame waits for its write
  acknowledgment before the worker produces another frame.
- Animated images are limited to 128 megapixels across the clip. Larger jobs can use PNG sequences.
- Sequence export times are limited to the first 30 minutes. Physical player seeks are limited to one
  hour and reject invalid times before changing the track.
- Single-file media writes are atomic. PNG frames are staged and published as a new `armature-frames-*`
  folder, so cancellation does not expose a partial frame set or overwrite an existing sequence.

`tools/smoke-video-worker.mjs` executes the built worker startup with no Node globals.
`tools/smoke-media-worker.mjs` runs the actual built Node worker for all three media types and checks
termination. These are CI build gates. Real WebCodecs output and platform engine pixels still need the
installed desktop/engine acceptance jobs; a VM startup smoke is not a codec or GPU test.
