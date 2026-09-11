import { initializeCanvas, readPsd, type Layer } from 'ag-psd';
import {
  joinLayerName,
  LayeredParseError,
  type LayeredDiagnostic,
  type LayeredDocument,
  type RasterLayer,
} from './layered-types';

// PSD adapter for the layered-file import (PP-D5). Parses a Photoshop .psd with ag-psd, a pure-JS reader
// (MIT; no native binaries), reading pixels as straight-alpha RGBA via `useImageData` so we never depend on
// a browser canvas. It flattens groups (path-joined names), keeps each raster layer's bounds and setup
// visibility, and records a typed diagnostic for anything outside the common 8-bit RGBA subset (an exotic
// bit depth, or a layer with no extractable raster: adjustment, text, shape, or a smart object without an
// embedded composite). It is a pure function of the file bytes (no filesystem, no Electron), so it is unit
// testable headless. Import only; nothing here ever writes a PSD.

// ag-psd decodes layer pixels into an ImageData produced by its `createImageData` helper, which defaults to
// a browser canvas. In the main process there is no canvas, so we register a plain-object createImageData
// once (a bare RGBA buffer is all we read via `useImageData`); the createCanvas method is never used and is
// a throwing stub. Guarded so repeated imports register it exactly once.
let canvasInitialized = false;
let decodedPixels = 0;
function ensureCanvasInitialized(): void {
  if (canvasInitialized) return;
  initializeCanvas(
    () => {
      throw new Error('ag-psd canvas is unavailable in the main process; use imageData');
    },
    (width, height) => {
      decodedPixels += width * height;
      if (
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width < 1 ||
        height < 1 ||
        width > 16384 ||
        height > 16384 ||
        decodedPixels > 64 * 1024 * 1024
      ) {
        throw new LayeredParseError(
          'PSD_RESOURCE_LIMIT',
          'PSD exceeds image dimensions or 64 million decoded pixels',
        );
      }
      return { width, height, data: new Uint8ClampedArray(width * height * 4) } as ImageData;
    },
  );
  canvasInitialized = true;
}

export function parsePsd(bytes: Uint8Array, name: string): LayeredDocument {
  decodedPixels = 0;
  if (bytes.byteLength > 256 * 1024 * 1024)
    throw new LayeredParseError('PSD_RESOURCE_LIMIT', 'PSD exceeds 256 MiB');
  if (bytes.byteLength >= 26) {
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (header.getUint16(24) === 4)
      throw new LayeredParseError(
        'PSD_PARSE_FAILED',
        'CMYK PSD imports are unsupported; convert a copy to RGB first',
      );
    const height = header.getUint32(14);
    const width = header.getUint32(18);
    if (width > 16384 || height > 16384 || width * height > 64 * 1024 * 1024)
      throw new LayeredParseError('PSD_RESOURCE_LIMIT', 'PSD canvas exceeds image limits');
  }
  ensureCanvasInitialized();
  const psd = readPsd(toArrayBuffer(bytes), {
    useImageData: true,
    totalMemoryLimit: 256 * 1024 * 1024,
    skipCompositeImageData: true,
    skipThumbnail: true,
    skipLinkedFilesData: true,
    throwForMissingFeatures: false,
  });

  const diagnostics: LayeredDiagnostic[] = [];
  if (psd.bitsPerChannel !== undefined && psd.bitsPerChannel !== 8) {
    diagnostics.push({
      feature: 'unsupported-bit-depth',
      layer: '',
      why: `document is ${psd.bitsPerChannel}-bit; layers are read as 8-bit RGBA and may lose precision`,
    });
  }

  const layers: RasterLayer[] = [];
  collect(psd.children ?? [], '', layers, diagnostics);

  if (layers.length === 0) {
    diagnostics.push({
      feature: 'no-layers',
      layer: '',
      why: 'the PSD contained no extractable 8-bit raster layers',
    });
  }

  return {
    name,
    canvasWidth: psd.width,
    canvasHeight: psd.height,
    layers,
    diagnostics,
  };
}

// Depth-first flatten. A group (has `children`) recurses with its name joined onto the prefix; a raster
// layer (has `imageData`) is emitted at its bounds; anything else is a typed non-raster diagnostic.
function collect(
  children: readonly Layer[],
  prefix: string,
  out: RasterLayer[],
  diagnostics: LayeredDiagnostic[],
): void {
  for (const layer of children) {
    const name = joinLayerName(prefix, layer.name);
    if (layer.children !== undefined) {
      collect(layer.children, name, out, diagnostics);
      continue;
    }
    const raster = toRasterLayer(layer, name, diagnostics);
    if (raster !== null) out.push(raster);
  }
}

function toRasterLayer(
  layer: Layer,
  name: string,
  diagnostics: LayeredDiagnostic[],
): RasterLayer | null {
  const image = layer.imageData;
  if (image === undefined) {
    diagnostics.push({
      feature: 'non-raster-layer',
      layer: name,
      why: 'layer has no raster pixels (adjustment, text, shape, or an unrasterized smart object); skipped',
    });
    return null;
  }
  const { width, height } = image;
  if (width < 1 || height < 1 || image.data.length !== width * height * 4) {
    diagnostics.push({
      feature: 'empty-layer',
      layer: name,
      why: 'layer resolved to a zero-area or malformed bitmap; skipped',
    });
    return null;
  }
  return {
    name,
    left: layer.left ?? 0,
    top: layer.top ?? 0,
    width,
    height,
    // Copy out of ag-psd's buffer into an owned, ArrayBuffer-backed array (straight alpha via useImageData).
    rgba: new Uint8Array(image.data),
    visible: layer.hidden !== true,
  };
}

// ag-psd accepts an ArrayBuffer; hand it a tight copy of the layer bytes (the Uint8Array may be a view into
// a larger buffer, e.g. a Node Buffer pool).
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
