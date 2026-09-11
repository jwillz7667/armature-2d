import { documentHost, installOpenedProject } from '../document';
import { bridge } from '../ipc-bridge';
import { useLayeredImportStore } from '../editor-state/layered-import-store';
import type { LayeredImportDiagnostic, SpineImportError } from '../../shared';

// The Import Layered File action (PP-D5), shared by the File menu item and the Assets panel button so every
// entry point runs the SAME flow. The main process owns the .psd/.ora dialog, parses the file OFF the
// renderer document path (no renderer filesystem path: the path-injection defense), packs the layers, and
// builds a validated document. On success the document loads through the EXISTING validated load flow
// (documentHost.load, which re-validates via loadDocument and resets History, LAW 3), the atlas page
// textures are published like a file-open restore, and the diagnostics (or the typed errors on failure) are
// pushed to the results store for the dialog. Returns a typed outcome so the caller can also log; the
// document crosses the wire as `unknown` and loadDocument re-validates it, so no narrowing assertion is
// needed for it.

export type LayeredImportOutcome =
  | {
      readonly kind: 'imported';
      readonly name: string;
      readonly diagnostics: readonly LayeredImportDiagnostic[];
    }
  | {
      readonly kind: 'failed';
      readonly errors: readonly SpineImportError[];
      readonly diagnostics: readonly LayeredImportDiagnostic[];
    }
  | { readonly kind: 'canceled' }
  | { readonly kind: 'error'; readonly message: string };

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function importLayeredFromDialog(): Promise<LayeredImportOutcome> {
  try {
    const original = documentHost.current();
    const result = await bridge().importLayeredFile();
    if (!result.ok) return { kind: 'error', message: result.error.message };
    const data = result.data;
    if (data.status === 'canceled') return { kind: 'canceled' };
    if (data.status === 'failed') {
      useLayeredImportStore
        .getState()
        .show({ status: 'failed', name: null, diagnostics: data.diagnostics, errors: data.errors });
      return { kind: 'failed', errors: data.errors, diagnostics: data.diagnostics };
    }

    const outcome = await installOpenedProject(
      { status: 'opened', name: data.name, document: data.document, pages: data.pages },
      original,
      true,
    );
    if (outcome.kind === 'error' || outcome.kind === 'canceled') return outcome;

    useLayeredImportStore
      .getState()
      .show({ status: 'imported', name: data.name, diagnostics: data.diagnostics, errors: [] });
    return { kind: 'imported', name: data.name, diagnostics: data.diagnostics };
  } catch (error) {
    // A missing bridge (failed preload) throws here; surface it instead of an opaque rejection.
    return { kind: 'error', message: messageOf(error, 'import failed') };
  }
}
