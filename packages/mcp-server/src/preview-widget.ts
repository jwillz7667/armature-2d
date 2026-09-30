// Inline, network-free viewer based on the official MCP Apps tool-result bridge
// example. Version the URI whenever the widget contract or assets change.
export const PREVIEW_URI = 'ui://armature/preview-v1.html';
export const PREVIEW_TOOL_META = {
  ui: { resourceUri: PREVIEW_URI },
  'openai/outputTemplate': PREVIEW_URI,
  'openai/toolInvocation/invoking': 'Rendering preview',
  'openai/toolInvocation/invoked': 'Preview ready',
};

export const previewHtml = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Armature preview</title><style>
:root{font:14px system-ui,sans-serif;color-scheme:light dark}
body{margin:0;padding:16px;background:Canvas;color:CanvasText}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
h1{font-size:16px;margin:0}#status{margin:0;font-size:13px;color:GrayText}
.stage{display:grid;place-items:center;min-height:80px;border:1px solid #8886;border-radius:10px;overflow:hidden;
background-color:#747474;background-image:linear-gradient(45deg,#999 25%,transparent 25%),linear-gradient(-45deg,#999 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#999 75%),linear-gradient(-45deg,transparent 75%,#999 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0}
img{display:block;max-width:100%;max-height:440px;object-fit:contain}img[hidden]{display:none}
#note{margin:10px 0 0;line-height:1.5}
</style></head><body>
<header><h1>Armature preview</h1><p id="status" role="status" aria-live="polite">Waiting for rendered frame</p></header>
<div class="stage"><img id="preview" alt="Rendered Armature frame" hidden></div>
<p id="note">The preview will appear when rendering completes.</p>
<script>
(() => {
  const image = document.getElementById('preview');
  const status = document.getElementById('status');
  const note = document.getElementById('note');
  let current;
  const notify = (method, params) => window.parent.postMessage({jsonrpc:'2.0',method,params}, '*');
  const resize = () => notify('ui/notifications/size-changed', {height:document.documentElement.scrollHeight});
  function fail(message) {
    current = undefined;
    image.hidden = true;
    image.removeAttribute('src');
    status.textContent = 'Preview unavailable';
    note.textContent = message;
    resize();
  }
  function render(output) {
    if (!output) return;
    // Only accept bounded PNG data from the host, never markup or remote URLs.
    if (typeof output.pngBase64 !== 'string' || output.pngBase64.length > 24 * 1024 * 1024 ||
        !output.pngBase64.startsWith('iVBORw0KGgo') ||
        output.pngBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(output.pngBase64) ||
        !Number.isInteger(output.width) || output.width < 1 || output.width > 2048 ||
        !Number.isInteger(output.height) || output.height < 1 || output.height > 2048 ||
        typeof output.placeholders !== 'boolean') {
      fail('The renderer returned an invalid preview. Ask for a new frame.');
      return;
    }
    current = output;
    image.hidden = true;
    status.textContent = 'Loading rendered frame';
    image.src = 'data:image/png;base64,' + output.pngBase64;
  }
  image.onload = () => {
    if (!current) return;
    if (image.naturalWidth !== current.width || image.naturalHeight !== current.height) {
      fail('The image dimensions do not match the renderer result.');
      return;
    }
    image.hidden = false;
    status.textContent = current.width + ' × ' + current.height + ' PNG';
    note.textContent = current.placeholders
      ? 'Placeholder textures: this frame uses white regions because the document has no atlas.'
      : 'Rendered with the document texture atlas.';
    resize();
  };
  image.onerror = () => fail('The PNG could not be decoded. Ask for a new frame.');
  window.addEventListener('message', event => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.jsonrpc !== '2.0') return;
    if (message.id === 'armature-preview-init' && message.result) {
      notify('ui/notifications/initialized', {});
      resize();
    } else if (message.method === 'ui/notifications/tool-result') {
      if (message.params?.isError) fail('Rendering failed. Ask for a new frame.');
      else render(message.params?.structuredContent);
    }
  });
  // Compatibility with ChatGPT hosts that deliver results through window.openai.
  window.addEventListener('openai:set_globals', event => render(event.detail?.globals?.toolOutput));
  render(window.openai?.toolOutput);
  window.parent.postMessage({jsonrpc:'2.0',id:'armature-preview-init',method:'ui/initialize',params:{
    appInfo:{name:'Armature preview',version:'1.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'
  }}, '*');
})();
</script></body></html>`;
