import type { AtlasImportPage, MediaExportOptions } from '../../shared';
import type { MediaExportResult } from './media-export-core';

export interface MediaWorkerInput {
  readonly document: unknown;
  readonly pages: readonly AtlasImportPage[];
  readonly options: MediaExportOptions;
}
export type MediaWorkerMessage =
  | { readonly type: 'progress'; readonly completed: number; readonly total: number }
  | { readonly type: 'frame'; readonly index: number; readonly png: Uint8Array }
  | { readonly type: 'done'; readonly result: MediaExportResult }
  | { readonly type: 'error'; readonly message: string };
