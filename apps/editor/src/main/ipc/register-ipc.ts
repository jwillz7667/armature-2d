// Main-process IPC wiring. Request/response only (ipcMain.handle). Handlers are registered ONLY
// for allowlisted channels, every payload is validated with Zod at this boundary, and a typed
// IpcResult is returned (never a bare throw across the wire). WP-0.8 extends this with file IO.

import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { approvedClosures, isTrustedSender } from './trusted-sender';
import {
  IpcChannel,
  atlasImportGridRequestSchema,
  atlasImportImagesRequestSchema,
  atlasImportPremadeRequestSchema,
  atlasImportRequestSchema,
  exportAtlasRequestSchema,
  exportCancelRequestSchema,
  exportMediaRequestSchema,
  exportProfileLoadRequestSchema,
  exportProfileSaveRequestSchema,
  exportProjectRequestSchema,
  exportWriteVideoRequestSchema,
  fileOpenRequestSchema,
  recoveryOpenRequestSchema,
  fileSaveRequestSchema,
  fileSessionRequestSchema,
  getVersionRequestSchema,
  getVersionResponseSchema,
  layeredImportRequestSchema,
  spineImportRequestSchema,
  validateWith,
  type AtlasImportResponse,
  type ExportAtlasResponse,
  type ExportCancelResponse,
  type ExportMediaResponse,
  type ExportProfileLoadResponse,
  type ExportProfileSaveResponse,
  type ExportProjectResponse,
  type ExportWriteVideoResponse,
  type FileOpenResponse,
  type FileSaveResponse,
  type GetVersionResponse,
  type IpcResult,
  type LayeredImportResponse,
  type SpineImportResponse,
} from '../../shared';
import { importAtlasFromDirectory, importAtlasImages } from '../atlas-import';
import { importPremadeAtlasFromFile } from '../atlas-premade-import';
import { importGridAtlasFromImage } from '../atlas-premade-io';
import {
  cancelMediaExport,
  exportAtlasWithProfile,
  exportMediaToFile,
  exportProjectToFile,
  loadExportProfileFromDialog,
  saveExportProfileFromDialog,
  writeVideoToFile,
} from '../export';
import {
  openDocumentFromFile,
  saveDocumentToFile,
  saveRecovery,
  openRecovery,
  discardRecovery,
} from '../file-io';
import { importLayeredFromFile } from '../layered-import';
import { importSpineProjectFromFile } from '../spine-import';

export function registerIpc(): void {
  // Only the registered application's top frame may use privileged file/import/export operations.
  const handle = (
    channel: string,
    listener: (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>,
  ): void => {
    ipcMain.handle(channel, async (event, payload: unknown) => {
      if (!isTrustedSender(event))
        return {
          ok: false,
          error: { code: 'IPC_BAD_REQUEST', message: 'Untrusted application frame' },
        };
      try {
        return await listener(event, payload);
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'IPC_HANDLER_ERROR',
            message: error instanceof Error ? error.message : 'Operation failed',
          },
        };
      }
    });
  };
  handle(IpcChannel.fileConfirmUnsaved, async (event, payload) => {
    if (payload !== undefined)
      return { ok: false, error: { code: 'IPC_BAD_REQUEST', message: 'Unexpected payload' } };
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window)
      return { ok: false, error: { code: 'IPC_HANDLER_ERROR', message: 'Window is unavailable' } };
    const choice = await dialog.showMessageBox(window, {
      type: 'question',
      title: 'Unsaved Changes',
      message: 'Save changes to this project?',
      detail: 'Discarding removes changes since the last save.',
      buttons: ['Save', 'Discard', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    return {
      ok: true,
      data: choice.response === 0 ? 'save' : choice.response === 1 ? 'discard' : 'cancel',
    };
  });
  handle(IpcChannel.fileCloseApproved, async (event, payload) => {
    if (payload !== undefined)
      return { ok: false, error: { code: 'IPC_BAD_REQUEST', message: 'Unexpected payload' } };
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      approvedClosures.add(window);
      setImmediate(() => window.close());
    }
    return { ok: true, data: { status: 'closed' } };
  });
  handle(IpcChannel.fileRecoverySave, async (_event, payload) => {
    const request = validateWith(fileSaveRequestSchema, payload, 'IPC_BAD_REQUEST');
    if (!request.ok) return request;
    if (!request.data.options)
      return { ok: false, error: { code: 'IPC_BAD_REQUEST', message: 'Missing project session' } };
    return saveRecovery(request.data.document, request.data.pages, request.data.options);
  });
  handle(IpcChannel.fileRecoveryOpen, async (_event, payload) => {
    const request = validateWith(recoveryOpenRequestSchema, payload, 'IPC_BAD_REQUEST');
    return request.ok ? openRecovery(request.data?.startup ?? false) : request;
  });
  handle(IpcChannel.fileRecoveryDiscard, async (_event, payload) => {
    const request = validateWith(fileSessionRequestSchema, payload, 'IPC_BAD_REQUEST');
    return request.ok ? discardRecovery(request.data.documentId) : request;
  });
  handle(
    IpcChannel.getVersion,
    async (_event, payload: unknown): Promise<IpcResult<GetVersionResponse>> => {
      const request = validateWith(getVersionRequestSchema, payload, 'IPC_BAD_REQUEST');
      if (!request.ok) return request;
      return validateWith(
        getVersionResponseSchema,
        { version: app.getVersion() },
        'IPC_BAD_RESPONSE',
      );
    },
  );

  handle(
    IpcChannel.fileSave,
    async (_event, payload: unknown): Promise<IpcResult<FileSaveResponse>> => {
      const request = validateWith(fileSaveRequestSchema, payload, 'IPC_BAD_REQUEST');
      if (!request.ok) return request;
      return saveDocumentToFile(request.data.document, request.data.pages, request.data.options);
    },
  );

  handle(
    IpcChannel.fileOpen,
    async (_event, payload: unknown): Promise<IpcResult<FileOpenResponse>> => {
      const request = validateWith(fileOpenRequestSchema, payload, 'IPC_BAD_REQUEST');
      if (!request.ok) return request;
      return openDocumentFromFile();
    },
  );

  handle(
    IpcChannel.atlasImport,
    async (_event, payload: unknown): Promise<IpcResult<AtlasImportResponse>> => {
      const request = validateWith(atlasImportRequestSchema, payload, 'IPC_BAD_REQUEST');
      if (!request.ok) return request;
      return importAtlasFromDirectory();
    },
  );

  handle(
    IpcChannel.atlasImportImages,
    async (_event, payload: unknown): Promise<IpcResult<AtlasImportResponse>> => {
      const request = validateWith(atlasImportImagesRequestSchema, payload, 'IPC_BAD_REQUEST');
      if (!request.ok) return request;
      return importAtlasImages(request.data.images);
    },
  );

  handle(
    IpcChannel.spineImport,
    async (_event, payload: unknown): Promise<IpcResult<SpineImportResponse>> => {
      const request = validateWith(spineImportRequestSchema, payload, 'IPC_BAD_REQUEST');
      if (!request.ok) return request;
      return importSpineProjectFromFile();
    },
  );

  handle(
    IpcChannel.exportProject,
    async (_event, payload: unknown): Promise<IpcResult<ExportProjectResponse>> => {
      const request = validateWith(exportProjectRequestSchema, payload, 'IPC_BAD_REQUEST');
      if (!request.ok) return request;
      return exportProjectToFile(request.data.document, request.data.format);
    },
  );

  handle(
    IpcChannel.exportMedia,
    async (event, payload: unknown): Promise<IpcResult<ExportMediaResponse>> => {
      const request = validateWith(exportMediaRequestSchema, payload, 'IPC_BAD_REQUEST');
      if (!request.ok) return request;
      const { jobId, document, pages, options } = request.data;
      return exportMediaToFile(event.sender, jobId, document, pages, options);
    },
  );

  handle(
    IpcChannel.exportCancel,
    async (_event, payload: unknown): Promise<IpcResult<ExportCancelResponse>> => {
      const request = validateWith(exportCancelRequestSchema, payload, 'IPC_BAD_REQUEST');
      if (!request.ok) return request;
      return cancelMediaExport(request.data.jobId);
    },
  );

  handle(
    IpcChannel.exportWriteVideo,
    async (_event, payload: unknown): Promise<IpcResult<ExportWriteVideoResponse>> => {
      const request = validateWith(exportWriteVideoRequestSchema, payload, 'IPC_BAD_REQUEST');
      if (!request.ok) return request;
      return writeVideoToFile(request.data.data, request.data.container, request.data.defaultName);
    },
  );

  handle(
    IpcChannel.exportProfileLoad,
    async (_event, payload: unknown): Promise<IpcResult<ExportProfileLoadResponse>> => {
      const request = validateWith(exportProfileLoadRequestSchema, payload, 'IPC_BAD_REQUEST');
      if (!request.ok) return request;
      return loadExportProfileFromDialog();
    },
  );

  handle(
    IpcChannel.exportProfileSave,
    async (_event, payload: unknown): Promise<IpcResult<ExportProfileSaveResponse>> => {
      const request = validateWith(exportProfileSaveRequestSchema, payload, 'IPC_BAD_REQUEST');
      if (!request.ok) return request;
      return saveExportProfileFromDialog(request.data.profile);
    },
  );

  handle(
    IpcChannel.exportAtlas,
    async (_event, payload: unknown): Promise<IpcResult<ExportAtlasResponse>> => {
      const request = validateWith(exportAtlasRequestSchema, payload, 'IPC_BAD_REQUEST');
      if (!request.ok) return request;
      return exportAtlasWithProfile(request.data.profile);
    },
  );

  handle(
    IpcChannel.atlasImportPremade,
    async (_event, payload: unknown): Promise<IpcResult<AtlasImportResponse>> => {
      const request = validateWith(atlasImportPremadeRequestSchema, payload, 'IPC_BAD_REQUEST');
      if (!request.ok) return request;
      return importPremadeAtlasFromFile();
    },
  );

  handle(
    IpcChannel.atlasImportGrid,
    async (_event, payload: unknown): Promise<IpcResult<AtlasImportResponse>> => {
      const request = validateWith(atlasImportGridRequestSchema, payload, 'IPC_BAD_REQUEST');
      if (!request.ok) return request;
      return importGridAtlasFromImage(request.data.image, request.data.grid);
    },
  );

  handle(
    IpcChannel.layeredImport,
    async (_event, payload: unknown): Promise<IpcResult<LayeredImportResponse>> => {
      const request = validateWith(layeredImportRequestSchema, payload, 'IPC_BAD_REQUEST');
      if (!request.ok) return request;
      return importLayeredFromFile();
    },
  );
}

export function disposeIpc(): void {
  ipcMain.removeHandler(IpcChannel.getVersion);
  ipcMain.removeHandler(IpcChannel.fileSave);
  ipcMain.removeHandler(IpcChannel.fileOpen);
  ipcMain.removeHandler(IpcChannel.atlasImport);
  ipcMain.removeHandler(IpcChannel.atlasImportImages);
  ipcMain.removeHandler(IpcChannel.spineImport);
  ipcMain.removeHandler(IpcChannel.exportProject);
  ipcMain.removeHandler(IpcChannel.exportMedia);
  ipcMain.removeHandler(IpcChannel.exportCancel);
  ipcMain.removeHandler(IpcChannel.exportWriteVideo);
  ipcMain.removeHandler(IpcChannel.exportProfileLoad);
  ipcMain.removeHandler(IpcChannel.exportProfileSave);
  ipcMain.removeHandler(IpcChannel.exportAtlas);
  ipcMain.removeHandler(IpcChannel.atlasImportPremade);
  ipcMain.removeHandler(IpcChannel.atlasImportGrid);
  ipcMain.removeHandler(IpcChannel.layeredImport);
}
