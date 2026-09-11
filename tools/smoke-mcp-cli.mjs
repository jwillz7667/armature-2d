import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../packages/mcp-server/dist/cli.js', import.meta.url));
const project = await mkdtemp(join(tmpdir(), 'armature-cli-'));
const child = spawn(process.execPath, [cli, project], {
  cwd: resolve(project),
  stdio: ['pipe', 'pipe', 'pipe'],
});
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
  console.log(`Built MCP CLI handshake and ${catalog.tools.length}-tool catalog pass.`);
} finally {
  child.kill();
  await rm(project, { recursive: true, force: true });
}
