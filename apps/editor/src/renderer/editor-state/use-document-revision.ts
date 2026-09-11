import { useSyncExternalStore } from 'react';
import { documentHost } from '../document';

export function useDocumentRevision(): number {
  return useSyncExternalStore(
    documentHost.subscribe,
    documentHost.getRevision,
    documentHost.getRevision,
  );
}
