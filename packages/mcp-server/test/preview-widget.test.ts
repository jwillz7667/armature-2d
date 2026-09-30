import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { previewHtml } from '../src/preview-widget';

type Event = { source?: unknown; data?: unknown; detail?: unknown };
function fixture(initial?: unknown) {
  const handlers = new Map<string, (event: Event) => void>();
  const messages: unknown[] = [];
  const image = {
    hidden: true,
    src: '',
    naturalWidth: 2,
    naturalHeight: 1,
    onload: () => {},
    onerror: () => {},
    removeAttribute: () => {
      image.src = '';
    },
  };
  const status = { textContent: '' };
  const note = { textContent: '' };
  const parent = { postMessage: (message: unknown) => messages.push(message) };
  const script = previewHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error('Missing widget script');
  runInNewContext(script, {
    window: {
      parent,
      openai: { toolOutput: initial },
      addEventListener: (name: string, handler: (event: Event) => void) =>
        handlers.set(name, handler),
    },
    document: {
      documentElement: { scrollHeight: 240 },
      getElementById: (id: string) => ({ preview: image, status, note })[id],
    },
  });
  const result = (output: unknown, source: unknown = parent) =>
    handlers.get('message')!({
      source,
      data: {
        jsonrpc: '2.0',
        method: 'ui/notifications/tool-result',
        params: { structuredContent: output },
      },
    });
  return { image, status, note, parent, messages, handlers, result };
}
const png = new PNG({ width: 2, height: 1 });
png.data.fill(255);
const output = {
  width: 2,
  height: 1,
  placeholders: true,
  pngBase64: PNG.sync.write(png).toString('base64'),
};

describe('preview widget bridge', () => {
  it('initializes the bridge and displays exact returned PNG bytes only after decoding', () => {
    const view = fixture();
    expect(view.messages[0]).toMatchObject({
      method: 'ui/initialize',
      params: { protocolVersion: '2026-01-26' },
    });
    view.handlers.get('message')!({
      source: view.parent,
      data: { jsonrpc: '2.0', id: 'armature-preview-init', result: {} },
    });
    expect(view.messages).toContainEqual({
      jsonrpc: '2.0',
      method: 'ui/notifications/initialized',
      params: {},
    });
    view.result(output);
    expect(view.image.src).toBe('data:image/png;base64,' + output.pngBase64);
    expect(view.image.hidden).toBe(true);
    view.image.onload();
    expect(view.image.hidden).toBe(false);
    expect(view.status.textContent).toBe('2 × 1 PNG');
    expect(view.note.textContent).toContain('Placeholder textures');
  });
  it('supports initial and updated ChatGPT compatibility results', () => {
    const view = fixture(output);
    view.image.onload();
    expect(view.image.hidden).toBe(false);
    view.handlers.get('openai:set_globals')!({
      detail: { globals: { toolOutput: { ...output, placeholders: false } } },
    });
    view.image.onload();
    expect(view.note.textContent).toBe('Rendered with the document texture atlas.');
  });
  it('ignores foreign frames and rejects URLs, markup and oversized dimensions', () => {
    const view = fixture();
    view.result(output, {});
    expect(view.image.src).toBe('');
    for (const invalid of [
      { ...output, pngBase64: 'https://attacker.example/image.png' },
      { ...output, pngBase64: '<img onerror=alert(1)>' },
      { ...output, width: 2049 },
    ]) {
      view.result(invalid);
      expect(view.image.hidden).toBe(true);
      expect(view.image.src).toBe('');
      expect(view.status.textContent).toBe('Preview unavailable');
    }
  });
  it('clears stale images on mismatched dimensions, decode errors and failed tools', () => {
    const view = fixture(output);
    view.image.naturalWidth = 3;
    view.image.onload();
    expect(view.image.hidden).toBe(true);
    expect(view.note.textContent).toContain('dimensions');
    view.result(output);
    view.image.onerror();
    expect(view.image.src).toBe('');
    expect(view.note.textContent).toContain('decoded');
    view.handlers.get('message')!({
      source: view.parent,
      data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { isError: true } },
    });
    expect(view.note.textContent).toBe('Rendering failed. Ask for a new frame.');
  });
});
