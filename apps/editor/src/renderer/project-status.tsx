import { useEffect, type ReactElement } from 'react';
import { documentHost, saveCurrentDocument } from './document';
import { useDocumentRevision } from './editor-state/use-document-revision';
import { useProblemsStore } from './editor-state/problems-store';

export function ProjectStatus(): ReactElement {
  useDocumentRevision();
  const dirty = documentHost.isDirty();
  const name = documentHost.current().model.name;
  const problems = useProblemsStore((state) => state.problems);
  const dismiss = useProblemsStore((state) => state.dismiss);
  useEffect(() => {
    document.title = `${dirty ? '* ' : ''}${name} - Armature 2D`;
  }, [dirty, name]);
  return (
    <>
      <div
        style={{
          height: 30,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 12px',
          background: '#1e222b',
          color: '#e2e7ef',
          fontSize: 12,
        }}
      >
        <span title={documentHost.path ?? 'New project'}>{name}</span>
        <span aria-live="polite">
          {dirty ? 'Unsaved changes' : documentHost.path ? 'Saved' : 'New project'}
        </span>
        <button
          type="button"
          onClick={() => {
            void saveCurrentDocument();
          }}
        >
          Save
        </button>
        {problems.length > 0 && (
          <span role="status">
            {problems.length} {problems.length === 1 ? 'problem' : 'problems'}
          </span>
        )}
      </div>
      {problems.length > 0 && (
        <aside
          aria-label="Project problems"
          style={{
            position: 'fixed',
            right: 12,
            bottom: 12,
            zIndex: 2000,
            width: 'min(480px, 90vw)',
            maxHeight: '40vh',
            overflow: 'auto',
            background: '#262a34',
            color: '#f0f2f6',
            padding: 12,
            border: '1px solid #666',
          }}
        >
          <strong>Problems</strong>
          {problems.map((problem) => (
            <div key={problem.id} style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <span
                role={problem.severity === 'error' ? 'alert' : 'status'}
                style={{ flex: 1, overflowWrap: 'anywhere' }}
              >
                {problem.message}
              </span>
              <button
                type="button"
                aria-label={`Dismiss: ${problem.message}`}
                onClick={() => dismiss(problem.id)}
              >
                Dismiss
              </button>
            </div>
          ))}
        </aside>
      )}
    </>
  );
}
