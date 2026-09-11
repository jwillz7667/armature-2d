export * from '@marionette/document-core';

import {
  exportProjectDocument,
  loadProjectDocument,
  type Document,
} from '@marionette/document-core';
import { createInitialDocument, createProductionEnvironment } from '../composition-root';
import {
  atlasTextureStore,
  effectsTextureStore,
  prepareAtlas,
  type PreparedAtlas,
} from '../editor-state/atlas-texture-store';
import { useSelectionStore } from '../editor-state/selection-store';
import { useSkinPreviewStore } from '../editor-state/skin-preview-store';
import { usePlaybackStore } from '../editor-state/playback-store';
import { useSlotSelectionStore } from '../editor-state/slot-selection-store';
import { useConstraintSelectionStore } from '../editor-state/constraint-selection-store';
import { useEventSelectionStore } from '../editor-state/event-selection-store';
import { useMeshEditStore } from '../editor-state/mesh-edit-store';
import { reportProblem } from '../editor-state/problems-store';
import { bridge } from '../ipc-bridge';
import type { AtlasImportPage, FileOpenResponse } from '../../shared';

function fingerprint(document: Document): string {
  // Revisions and selection are excluded, so Undo to the savepoint is clean. Snapshots also preserve
  // unfinished edits that a strict runtime export may reject.
  return JSON.stringify([document.model.snapshot(), document.effects.snapshot()]);
}

export class DocumentHost {
  private document = createInitialDocument();
  private detachReconciler = this.attachReconciler(this.document);
  private sessionId: string = crypto.randomUUID();
  private saved = fingerprint(this.document);
  private serial = 0;
  private observed = '';
  private snapshotKey = '';
  private snapshotText = '';
  private raf: number | null = null;
  private readonly listeners = new Set<() => void>();
  path: string | null = null;

  current(): Document {
    return this.document;
  }
  identity(): string {
    return this.sessionId;
  }
  capture(): string {
    const key = `${this.sessionId}:${this.document.model.revision}:${this.document.effects.revision}`;
    if (key !== this.snapshotKey) {
      this.snapshotKey = key;
      this.snapshotText = fingerprint(this.document);
    }
    return this.snapshotText;
  }
  isDirty(): boolean {
    return this.capture() !== this.saved;
  }
  getRevision = (): number => this.serial;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    // One shared observer covers live gestures; committed commands and swaps notify synchronously.
    if (this.raf === null && typeof requestAnimationFrame === 'function')
      this.raf = requestAnimationFrame(this.poll);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.raf !== null) {
        cancelAnimationFrame(this.raf);
        this.raf = null;
      }
    };
  };
  private poll = (): void => {
    this.checkRevision();
    this.raf = this.listeners.size ? requestAnimationFrame(this.poll) : null;
  };
  private checkRevision(): void {
    const revision = `${this.sessionId}:${this.document.model.revision}:${this.document.effects.revision}`;
    if (revision !== this.observed) {
      this.observed = revision;
      this.emit();
    }
  }
  private emit(): void {
    ++this.serial;
    for (const listener of this.listeners) listener();
  }
  markSaved(id: string, snapshot: string, path: string): void {
    if (id !== this.sessionId) return;
    this.saved = snapshot;
    this.path = path;
    this.emit();
  }
  markDirty(): void {
    this.saved = '';
    this.emit();
  }
  load(
    json: unknown,
    options: {
      readonly documentId?: string;
      readonly path?: string;
      readonly dirty?: boolean;
    } = {},
  ): void {
    this.replace(loadProjectDocument(json, createProductionEnvironment()), options);
  }
  newDocument(): void {
    this.replace(createInitialDocument());
  }
  replace(
    next: Document,
    options: {
      readonly documentId?: string;
      readonly path?: string;
      readonly dirty?: boolean;
    } = {},
  ): void {
    this.detachReconciler();
    atlasTextureStore.clear();
    effectsTextureStore.clear();
    this.document = next;
    this.sessionId = options.documentId ?? crypto.randomUUID();
    this.path = options.path ?? null;
    this.saved = options.dirty ? '' : fingerprint(next);
    this.detachReconciler = this.attachReconciler(next);
    useSelectionStore.getState().clear();
    useSlotSelectionStore.getState().clearSlot();
    useConstraintSelectionStore.getState().select(null);
    useEventSelectionStore.getState().clearEvent();
    useMeshEditStore.getState().clearVertex();
    useSkinPreviewStore.getState().reset();
    usePlaybackStore.getState().setActiveAnimation(null);
    usePlaybackStore.getState().setClipboard([]);
    this.checkRevision();
  }
  private attachReconciler(document: Document): () => void {
    return document.history.subscribe((event) => {
      const selection = useSelectionStore.getState();
      selection.applyHint(event.selectionHint);
      selection.prune((id) => document.model.getBone(id) !== undefined);
      void atlasTextureStore
        .activate(document.model.preserved().atlas)
        .catch((error: unknown) => reportProblem(messageOf(error, 'Texture restore failed')));
      void effectsTextureStore
        .activate(document.effects.atlas())
        .catch((error: unknown) =>
          reportProblem(messageOf(error, 'Effects texture restore failed')),
        );
      this.checkRevision();
    });
  }
}

export const documentHost = new DocumentHost();
export type FileActionOutcome =
  | { readonly kind: 'saved'; readonly path: string }
  | { readonly kind: 'opened'; readonly name: string }
  | { readonly kind: 'canceled' }
  | { readonly kind: 'error'; readonly message: string };

function projectPages(): readonly AtlasImportPage[] {
  return [
    ...atlasTextureStore.getPageBytes().map((page) => ({ ...page, scope: 'skeleton' as const })),
    ...effectsTextureStore.getPageBytes().map((page) => ({ ...page, scope: 'effects' as const })),
  ];
}
export async function saveCurrentDocument(saveAs = false): Promise<FileActionOutcome> {
  const current = documentHost.current();
  const id = documentHost.identity();
  try {
    current.history.checkpoint();
    const snapshot = documentHost.capture();
    const result = await bridge().saveDocument(exportProjectDocument(current), projectPages(), {
      documentId: id,
      saveAs,
    });
    if (!result.ok) return fail(result.error.message);
    if (result.data.status === 'canceled') return { kind: 'canceled' };
    documentHost.markSaved(id, snapshot, result.data.path);
    if (documentHost.identity() === id && !documentHost.isDirty())
      await bridge().discardRecovery(id);
    return { kind: 'saved', path: result.data.path };
  } catch (error) {
    return fail(messageOf(error, 'Save failed'));
  }
}

let confirming: Promise<boolean> | null = null;
let allowUnload = false;
export async function confirmDiscardChanges(): Promise<boolean> {
  if (confirming) return confirming;
  if (!documentHost.isDirty()) return true;
  const id = documentHost.identity();
  confirming = (async () => {
    try {
      const result = await bridge().confirmUnsaved();
      if (!result.ok) {
        fail(result.error.message);
        return false;
      }
      if (id !== documentHost.identity() || result.data === 'cancel') return false;
      if (result.data === 'save')
        return (await saveCurrentDocument()).kind === 'saved' && !documentHost.isDirty();
      await bridge().discardRecovery(id);
      return id === documentHost.identity();
    } catch (error) {
      fail(messageOf(error, 'Could not confirm unsaved changes'));
      return false;
    } finally {
      confirming = null;
    }
  })();
  return confirming;
}
export async function newDocumentSafely(): Promise<void> {
  if (await confirmDiscardChanges()) documentHost.newDocument();
}
export async function closeDocumentSafely(): Promise<void> {
  if (await confirmDiscardChanges()) {
    allowUnload = true;
    try {
      const result = await bridge().closeApproved();
      if (!result.ok) {
        allowUnload = false;
        fail(result.error.message);
      }
    } catch (error) {
      allowUnload = false;
      fail(messageOf(error, 'Could not close project'));
    }
  }
}
export async function openDocumentFromDialog(
  recovery = false,
  startup = false,
): Promise<FileActionOutcome> {
  const original = documentHost.current();
  try {
    const result = recovery
      ? await bridge().openRecovery(startup ? { startup: true } : undefined)
      : await bridge().openDocument();
    if (!result.ok) return fail(result.error.message);
    if (result.data.status === 'canceled' || original !== documentHost.current())
      return { kind: 'canceled' };
    return await installOpenedProject(result.data, original, recovery);
  } catch (error) {
    return fail(messageOf(error, 'Open failed'));
  }
}
export async function installOpenedProject(
  data: Extract<FileOpenResponse, { status: 'opened' }>,
  original: Document,
  dirty = false,
): Promise<FileActionOutcome> {
  const next = loadProjectDocument(data.document, createProductionEnvironment());
  const staged: PreparedAtlas[] = [];
  try {
    staged.push(
      await prepareAtlas(
        next.model.preserved().atlas,
        data.pages.filter((page) => page.scope !== 'effects'),
      ),
    );
    staged.push(
      await prepareAtlas(
        next.effects.atlas(),
        data.pages.filter((page) => page.scope === 'effects'),
      ),
    );
    if (original !== documentHost.current() || !(await confirmDiscardChanges()))
      return { kind: 'canceled' };
    if (original !== documentHost.current()) return { kind: 'canceled' };
    documentHost.replace(next, {
      ...(data.documentId ? { documentId: data.documentId } : {}),
      ...(!dirty && data.path ? { path: data.path } : {}),
      dirty,
    });
    atlasTextureStore.install(staged[0]!);
    effectsTextureStore.install(staged[1]!);
    staged.length = 0;
    await atlasTextureStore.activate(next.model.preserved().atlas);
    await effectsTextureStore.activate(next.effects.atlas());
    for (const warning of data.warnings ?? []) reportProblem(warning, 'warning');
    return { kind: 'opened', name: data.name };
  } catch (error) {
    return fail(messageOf(error, 'Project could not be opened'));
  } finally {
    for (const atlas of staged) atlas.dispose();
  }
}
export function attachProjectRecovery(): () => void {
  void openDocumentFromDialog(true, true);
  let busy = false;
  let last = '';
  const timer = setInterval(() => {
    const current = documentHost.current();
    if (busy || confirming || !documentHost.isDirty() || current.history.inInteraction) return;
    const key = `${documentHost.identity()}:${current.model.revision}:${current.effects.revision}`;
    if (key === last) return;
    busy = true;
    try {
      void bridge()
        .saveRecovery(exportProjectDocument(current), projectPages(), {
          documentId: documentHost.identity(),
        })
        .then((result) => {
          if (result.ok) last = key;
          else reportProblem(`Recovery copy could not be saved: ${result.error.message}`);
        })
        .catch((error: unknown) => reportProblem(messageOf(error, 'Recovery save failed')))
        .finally(() => {
          busy = false;
        });
    } catch (error) {
      busy = false;
      reportProblem(messageOf(error, 'Recovery save failed'));
    }
  }, 15000);
  const unload = (event: BeforeUnloadEvent): void => {
    if (!allowUnload && documentHost.isDirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', unload);
  return () => {
    clearInterval(timer);
    window.removeEventListener('beforeunload', unload);
  };
}
function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
function fail(message: string): FileActionOutcome {
  reportProblem(message);
  return { kind: 'error', message };
}
