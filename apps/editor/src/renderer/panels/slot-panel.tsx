import type { IDockviewPanelProps } from 'dockview';
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { documentHost } from '../document';
import type { PresentationTimeline } from '@marionette/runtime-core';
import { parseRecordedScenario } from './slot-preview/slot-preview-input';
import { NumberInput } from './authoring-fields';
import { useDocumentRevision } from '../editor-state/use-document-revision';
import { SlotAuthoring } from './slot-authoring';
import {
  mountSlotPreview,
  type SlotPreviewHandle,
  type SlotPreviewHud,
} from './slot-preview/slot-preview-view';
import {
  DEFAULT_SLOT_PREVIEW_SCENARIO,
  SLOT_PREVIEW_SCENARIOS,
  slotScenarioLabel,
  toScenarioId,
  type SlotPreviewScenarioId,
} from './slot-preview/slot-preview-model';
import { makePreviewTransport, type PreviewTransport } from './preview/preview-transport';
import './authoring.css';

export function SlotPanel(_props: IDockviewPanelProps): ReactElement {
  const revision = useDocumentRevision();
  const doc = documentHost.current();
  return (
    <div style={rootStyle}>
      <SlotPreviewPane key={documentHost.identity()} revision={revision} />
      <SlotAuthoring key={documentHost.identity()} scene={doc.model.slotScene()} />
    </div>
  );
}

const EMPTY_PREVIEW_HUD: SlotPreviewHud = {
  rollupValue: null,
  escalation: null,
  flowState: null,
  lastVfx: null,
};

// The live slot scene preview (PP-D8): mounts the runtime-web SlotSceneView playing a committed mock
// scenario's PresentationTimeline (reel stops, landings, win highlights, counter rollup) through the SAME
// sequencer + renderer the packaged player uses. The scenario selector picks a committed MockMathEngine
// outcome (LAW 1: the preview only ever consumes a SpinResult, never fabricates one); playback transport
// reuses the shared transport state machine. It lives inside the slot panel (like the effects preview lives
// in the effects panel) so the composed scene and its playback sit together; the GL host owns its own
// Application lifecycle. The pane re-syncs from the document on every revision without issuing a command.
function SlotPreviewPane(props: { readonly revision: number }): ReactElement {
  const { revision } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<SlotPreviewHandle | null>(null);
  const [transport, setTransport] = useState<PreviewTransport>(() => makePreviewTransport());
  const [scenario, setScenario] = useState<SlotPreviewScenarioId>(DEFAULT_SLOT_PREVIEW_SCENARIO);
  const [hud, setHud] = useState<SlotPreviewHud>(EMPTY_PREVIEW_HUD);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  const [recordedName, setRecordedName] = useState<string | null>(null);
  const [seed, setSeed] = useState(1);
  const [timeline, setTimeline] = useState<PresentationTimeline | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const handle = mountSlotPreview(host, {
      onTransport: setTransport,
      onScenario: setScenario,
      onHud: setHud,
      onNotice: setPreviewNotice,
      onTimeline: setTimeline,
    });
    handleRef.current = handle;
    return () => {
      requestRef.current++;
      handle.destroy();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    handleRef.current?.resyncFromDocument();
  }, [revision]);

  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <span>Scene Preview</span>
        <span style={countStyle}>{recordedName ?? 'committed scenario'}</span>
      </div>
      <div style={previewToolbarStyle}>
        <button
          type="button"
          style={smallButtonStyle}
          title={transport.isPlaying ? 'Pause' : 'Play'}
          onClick={() => handleRef.current?.togglePlay()}
        >
          {transport.isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          style={smallButtonStyle}
          title="Replay the scenario from the start"
          onClick={() => handleRef.current?.restart()}
        >
          Restart
        </button>
        <select
          style={scenarioSelectStyle}
          value={scenario}
          title="The mock SpinResult scenario to play"
          onChange={(event) => {
            requestRef.current++;
            setRecordedName(null);
            handleRef.current?.setScenario(toScenarioId(event.target.value));
          }}
        >
          {SLOT_PREVIEW_SCENARIOS.map((id) => (
            <option key={id} value={id}>
              {slotScenarioLabel(id)}
            </option>
          ))}
        </select>
        <button
          type="button"
          style={smallButtonStyle}
          title="Cycle the preview background (dark / light / checker)"
          onClick={() => handleRef.current?.cycleBackground()}
        >
          BG: {transport.background}
        </button>
      </div>
      <div className="authoring">
        <NumberInput
          label="Effects preview seed"
          value={seed}
          min={0}
          max={0xffffffff}
          step={1}
          onChange={(value) => {
            setSeed(value);
            handleRef.current?.setSeed(value);
          }}
        />
        <label className="authoring-field">
          <span>Load recorded result</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (!file) return;
              const request = ++requestRef.current;
              const identity = documentHost.identity();
              void (async () => {
                if (file.size > 1024 * 1024)
                  throw new Error('Recorded results must be at most 1 MiB.');
                const raw: unknown = JSON.parse(await file.text());
                if (request !== requestRef.current || identity !== documentHost.identity()) return;
                const grid = documentHost.current().model.slotGrid();
                const result = parseRecordedScenario(raw, grid.rows, grid.cols);
                handleRef.current?.setRecordedScenario(result);
                setRecordedName(file.name);
              })().catch((error: unknown) => {
                if (request === requestRef.current && identity === documentHost.identity())
                  setPreviewNotice(
                    error instanceof Error ? error.message : 'Unable to load recorded result.',
                  );
              });
            }}
          />
        </label>
      </div>
      <div style={previewHostWrapStyle}>
        <div ref={hostRef} style={previewHostStyle} />
        {previewNotice !== null && <div style={previewNoticeStyle}>{previewNotice}</div>}
        <div style={previewHudStyle}>
          {hud.rollupValue !== null && <span style={hudWinStyle}>Win {hud.rollupValue}</span>}
          {hud.escalation !== null && <span style={hudBadgeStyle}>{hud.escalation}</span>}
          {hud.flowState !== null && <span style={hudFlowStyle}>{hud.flowState}</span>}
          {hud.lastVfx !== null && <span style={hudVfxStyle}>{hud.lastVfx}</span>}
        </div>
      </div>
      {timeline && (
        <details className="authoring-group">
          <summary>Scheduled events ({timeline.directives.length})</summary>
          <div style={{ maxHeight: 180, overflow: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Time (ms)</th>
                  <th>Event</th>
                </tr>
              </thead>
              <tbody>
                {timeline.directives.slice(0, 200).map((event) => (
                  <tr key={event.seq}>
                    <td>{event.atMs}</td>
                    <td>
                      {event.kind}
                      {'state' in event
                        ? `: ${event.state}`
                        : 'preset' in event
                          ? `: ${event.preset}`
                          : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {timeline.directives.length > 200 && <p>Showing the first 200 events.</p>}
          </div>
        </details>
      )}
    </div>
  );
}

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  background: '#1b1b1b',
  color: '#dddddd',
  fontSize: 12,
  overflowY: 'auto',
};

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  borderBottom: '1px solid #333333',
};

const sectionHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  borderBottom: '1px solid #2c2c2c',
  color: '#cccccc',
  fontWeight: 600,
  background: '#202020',
};

const countStyle: CSSProperties = { marginLeft: 'auto', color: '#888888', fontWeight: 400 };

const smallButtonStyle: CSSProperties = {
  flex: '0 0 auto',
  padding: '3px 8px',
  fontSize: 11,
  color: '#dddddd',
  background: '#2d2d2d',
  border: '1px solid #444444',
  borderRadius: 4,
  cursor: 'pointer',
};

const previewToolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 8px',
  borderBottom: '1px solid #2c2c2c',
  flexWrap: 'wrap',
};

const scenarioSelectStyle: CSSProperties = {
  fontSize: 12,
  color: '#dddddd',
  background: '#222222',
  border: '1px solid #3a3a3a',
  borderRadius: 3,
  padding: '2px 6px',
};

const previewHostWrapStyle: CSSProperties = {
  position: 'relative',
  height: 260,
  flex: '0 0 auto',
};

const previewHostStyle: CSSProperties = { width: '100%', height: '100%' };

const previewNoticeStyle: CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
  right: 8,
  padding: '4px 8px',
  borderRadius: 4,
  background: 'rgba(40, 30, 18, 0.9)',
  border: '1px solid #6a5a2a',
  color: '#e0c98a',
  pointerEvents: 'none',
};

const previewHudStyle: CSSProperties = {
  position: 'absolute',
  bottom: 8,
  left: 8,
  display: 'flex',
  gap: 6,
  pointerEvents: 'none',
};

const hudBadgeBaseStyle: CSSProperties = {
  padding: '2px 8px',
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 700,
  color: '#141414',
};

const hudWinStyle: CSSProperties = { ...hudBadgeBaseStyle, background: '#ffe066' };

const hudBadgeStyle: CSSProperties = {
  ...hudBadgeBaseStyle,
  background: '#ff8a5a',
  textTransform: 'uppercase',
};

const hudFlowStyle: CSSProperties = { ...hudBadgeBaseStyle, background: '#7ad0ff' };

const hudVfxStyle: CSSProperties = { ...hudBadgeBaseStyle, background: '#b28aff' };
