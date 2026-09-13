import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, copyFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../packages/mcp-server/dist/cli.js', import.meta.url));
const project = await mkdtemp(join(tmpdir(), 'armature-cli-'));
const child = spawn(process.execPath, [cli, project], {
  cwd: resolve(project),
  stdio: ['pipe', 'pipe', 'pipe'],
});
const closed = new Promise((resolve) => child.once('close', resolve));
const responses = new Map();
let buffer = '',
  stderr = '',
  failure = null,
  count = 0;
child.stderr.on('data', (chunk) => {
  stderr = (stderr + chunk.toString()).slice(-8000);
});
child.on('error', (error) => {
  failure = error;
});
child.on('exit', (code) => {
  failure = new Error(`MCP exited with ${code}: ${stderr}`);
});
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  if (buffer.length > 4 * 1024 * 1024) {
    failure = new Error('MCP output exceeded smoke-test budget');
    child.kill();
    return;
  }
  let end;
  while ((end = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, end);
    buffer = buffer.slice(end + 1);
    try {
      const message = JSON.parse(line);
      if (message.id !== undefined) responses.set(message.id, message);
    } catch {
      failure = new Error(`Non-JSON protocol output: ${line.slice(0, 200)}`);
    }
  }
});
const send = (message) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
async function request(method, params) {
  const id = ++count;
  send({ id, method, params });
  const deadline = Date.now() + 15000;
  while (!responses.has(id)) {
    if (failure) throw failure;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${method}: ${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const response = responses.get(id);
  assert.equal(response.error, undefined, JSON.stringify(response.error));
  return response.result;
}
try {
  const initialized = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'armature-ci', version: '1.0.0' },
  });
  assert.ok(initialized.serverInfo.name);
  send({ method: 'notifications/initialized' });
  const catalog = await request('tools/list', {});
  assert.equal(catalog.tools.length, 208);
  assert.equal(new Set(catalog.tools.map((tool) => tool.name)).size, catalog.tools.length);
  // Prove the process handles a second request rather than only emitting a startup response.
  const repeated = await request('tools/list', {});
  assert.deepEqual(repeated, catalog);
  async function call(name, args) {
    const result = await request('tools/call', { name, arguments: args });
    assert.ok(!result.isError, JSON.stringify(result));
    return JSON.parse(result.content[0].text);
  }
  const { documentId } = await call('document.new', { name: 'Agent smoke' });
  const { boneId } = await call('bone.create', { documentId, name: 'root', length: 50 });
  await copyFile(
    new URL('../packages/render-preview/test/goldens/two-color-region.png', import.meta.url),
    join(project, 'tile.png'),
  );
  const sourcePng = await readFile(join(project, 'tile.png'));
  const w = sourcePng.readUInt32BE(16),
    h = sourcePng.readUInt32BE(20);
  await call('atlas.set', {
    documentId,
    atlas: {
      pages: [
        {
          file: 'tile.png',
          width: w,
          height: h,
          regions: [
            {
              name: 'tile',
              x: 0,
              y: 0,
              w,
              h,
              rotated: false,
              offsetX: 0,
              offsetY: 0,
              originalW: w,
              originalH: h,
            },
          ],
        },
      ],
    },
  });
  const { slotId } = await call('slot.create', { documentId, boneId, name: 'body' });
  await call('attach.region.add', {
    documentId,
    slotId,
    name: 'body',
    path: 'tile',
    width: 32,
    height: 32,
  });
  await call('slot.activeAttachment', { documentId, slotId, attachment: 'body' });
  const original = await call('document.export', { documentId });
  await call('bone.move', { documentId, boneId, x: 20, y: 30 });
  const changed = await call('document.export', { documentId });
  assert.notDeepEqual(changed, original);
  await call('history.undo', { documentId });
  assert.deepEqual(await call('document.export', { documentId }), original);
  await call('history.redo', { documentId });
  assert.deepEqual(await call('document.export', { documentId }), changed);
  assert.equal((await call('document.validate', { documentId })).ok, true);
  const render = await call('render_frame', { documentId, width: 64, height: 64 });
  assert.equal(
    Buffer.from(render.pngBase64, 'base64').subarray(0, 8).toString('hex'),
    '89504e470d0a1a0a',
  );
  assert.equal(render.width, 64);
  assert.equal(render.placeholders, false);
  assert.deepEqual(await call('render_frame', { documentId, width: 64, height: 64 }), render);
  await call('document.save', { documentId, path: 'agent.json' });
  const reopened = await call('document.open', { path: 'agent.json' });
  assert.deepEqual(await call('document.export', { documentId: reopened.documentId }), changed);
  const denied = await request('tools/call', {
    name: 'document.save',
    arguments: { documentId, path: '../escape.json' },
  });
  assert.equal(denied.isError, true);
  assert.equal(JSON.parse(denied.content[0].text).code, 'PATH_FORBIDDEN');
  console.log(
    `MCP: ${catalog.tools.length} tools; create, edit, undo/redo, validate, deterministic PNG, save/reopen and traversal denial pass.`,
  );
} finally {
  child.kill();
  // Windows keeps the child working directory locked until process termination completes.
  await closed;
  await rm(project, { recursive: true, force: true });
}
