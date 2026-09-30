import { mkdtemp, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpServer } from '../src/http';
import { toolCatalog } from '../src/catalog';
import * as nodeFiles from '../src/node-files';

const issuer = 'https://identity.example.test/';
const resource = 'https://armature.example.test/mcp';
const nativeFetch = globalThis.fetch;
const pair = await generateKeyPair('ES256');
const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' };
async function token(
  subject = 'alice',
  overrides: { audience?: string; scope?: string; expiry?: number; issuer?: string } = {},
) {
  return new SignJWT({ scope: overrides.scope ?? 'armature:edit' })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setSubject(subject)
    .setIssuer(overrides.issuer ?? issuer)
    .setAudience(overrides.audience ?? resource)
    .setIssuedAt()
    .setExpirationTime(overrides.expiry ?? Math.floor(Date.now() / 1000) + 600)
    .sign(pair.privateKey);
}
// Node fetch rewrites Host, so use the native HTTP client to exercise proxy-facing host checks.
async function localFetch(
  url: string,
  init: { method?: string; headers: Record<string, string>; body?: string },
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method: init.method ?? 'GET', headers: init.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () =>
        resolve(
          new Response(Buffer.concat(chunks), {
            status: res.statusCode!,
            headers: Object.fromEntries(
              Object.entries(res.headers).filter(
                (entry): entry is [string, string] => typeof entry[1] === 'string',
              ),
            ),
          }),
        ),
      );
    });
    req.on('error', reject);
    req.end(init.body);
  });
}
let app: Awaited<ReturnType<typeof createHttpServer>>;
let root: string;
let base: string;
let nextId = 0;
beforeEach(async () => {
  vi.stubGlobal(
    'fetch',
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (String(input) === `${issuer}jwks`) return Promise.resolve(Response.json({ keys: [jwk] }));
      return nativeFetch(input, init);
    },
  );
  root = await mkdtemp(join(tmpdir(), 'armature-http-'));
  app = await createHttpServer({
    dataRoot: root,
    publicUrl: resource,
    issuer,
    jwksUrl: `${issuer}jwks`,
    maxSessions: 2,
    maxSessionsPerOwner: 1,
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('No listening address');
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  await app.close();
  await rm(root, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function request(
  accessToken: string,
  body: unknown,
  session?: string,
  extra: Record<string, string> = {},
) {
  return localFetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      host: 'armature.example.test',
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(session ? { 'mcp-session-id': session } : {}),
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
async function initialize(accessToken: string) {
  return request(accessToken, {
    jsonrpc: '2.0',
    id: ++nextId,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' },
    },
  });
}
async function rpc(accessToken: string, session: string, method: string, params: unknown = {}) {
  const response = await request(
    accessToken,
    { jsonrpc: '2.0', id: ++nextId, method, params },
    session,
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.error).toBeUndefined();
  return body.result;
}
async function call(accessToken: string, session: string, name: string, args: unknown) {
  const result = await rpc(accessToken, session, 'tools/call', { name, arguments: args });
  expect(result.isError, JSON.stringify(result)).not.toBe(true);
  const parsed = JSON.parse(result.content[0].text);
  expect(result.structuredContent).toEqual(parsed);
  return parsed;
}

describe('authenticated HTTP MCP', () => {
  it('serves only the configured public domain proof on the exact guarded route', async () => {
    const path = '/.well-known/openai-apps-challenge';
    const headers = { host: 'armature.example.test' };
    expect((await localFetch(`${base}${path}`, { headers })).status).toBe(404);
    await app.close();
    const proof = 'test-domain-proof-0123456789';
    app = await createHttpServer({
      dataRoot: root,
      publicUrl: resource,
      issuer,
      jwksUrl: `${issuer}jwks`,
      openaiChallengeToken: proof,
    });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('No listening address');
    const url = `http://127.0.0.1:${address.port}${path}`;
    const response = await localFetch(url, { headers });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe(proof);
    expect((await localFetch(url, { method: 'POST', headers })).status).toBe(404);
    expect((await localFetch(`${url}/`, { headers })).status).toBe(404);
    expect((await localFetch(url, { headers: { host: 'attacker.test' } })).status).toBe(403);
    expect(
      (await localFetch(url, { headers: { ...headers, origin: 'https://attacker.test' } })).status,
    ).toBe(403);
  });
  it('rejects malformed domain proof configuration before starting a server', async () => {
    await expect(
      createHttpServer({
        dataRoot: root,
        publicUrl: resource,
        issuer,
        jwksUrl: `${issuer}jwks`,
        openaiChallengeToken: 'proof\nwith-control-character',
      }),
    ).rejects.toThrow('Invalid OpenAI domain challenge token');
  });
  it('enforces authenticated request limits without letting one user consume another user bucket', async () => {
    await app.close();
    app = await createHttpServer({
      dataRoot: root,
      publicUrl: resource,
      issuer,
      jwksUrl: `${issuer}jwks`,
      requestsPerMinute: 2,
    });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('No listening address');
    base = `http://127.0.0.1:${address.port}`;
    const alice = await token('alice');
    const first = await initialize(alice);
    expect(first.status).toBe(200);
    await rpc(alice, first.headers.get('mcp-session-id')!, 'tools/list');
    const blocked = await initialize(alice);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await initialize(await token('bob'))).status).toBe(200);
  });
  it('advertises OAuth metadata and challenges missing credentials', async () => {
    const response = await initialize('');
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain(
      '/.well-known/oauth-protected-resource/mcp',
    );
    const metadata = await localFetch(`${base}/.well-known/oauth-protected-resource/mcp`, {
      headers: { host: 'armature.example.test' },
    });
    expect(await metadata.json()).toMatchObject({ resource, authorization_servers: [issuer] });
  });
  it.each([
    { audience: 'https://other.test/mcp' },
    { issuer: 'https://other.test/' },
    { expiry: 1 },
  ])('rejects invalid JWT claims %j', async (claims) => {
    expect((await initialize(await token('alice', claims))).status).toBe(401);
  });
  it('rejects an invalid signature and insufficient scope', async () => {
    const valid = await token();
    const pieces = valid.split('.');
    pieces[2] = Buffer.alloc(64).toString('base64url');
    expect((await initialize(pieces.join('.'))).status).toBe(401);
    expect((await initialize(await token('alice', { scope: 'unrelated' }))).status).toBe(403);
  });
  it('rejects foreign hosts, origins, batches and oversized bodies', async () => {
    const access = await token();
    expect((await request(access, {}, undefined, { host: 'attacker.test' })).status).toBe(403);
    expect((await request(access, {}, undefined, { origin: 'https://attacker.test' })).status).toBe(
      403,
    );
    expect((await request(access, [], undefined)).status).toBe(400);
    expect((await request(access, { data: 'x'.repeat(1024 * 1024) }, undefined)).status).toBe(413);
  });
  it('isolates sessions, rechecks tokens, enforces capacity and frees deleted sessions', async () => {
    const alice = await token();
    const bob = await token('bob');
    const first = await initialize(alice);
    expect(first.status).toBe(200);
    const session = first.headers.get('mcp-session-id')!;
    expect(
      (await request(bob, { jsonrpc: '2.0', id: 3, method: 'tools/list' }, session)).status,
    ).toBe(404);
    expect((await request(await token('alice', { expiry: 1 }), {}, session)).status).toBe(401);
    await call(alice, session, 'document.new', { name: 'Keep this work' });
    expect((await initialize(bob)).status).toBe(200);
    expect((await initialize(await token('charlie'))).status).toBe(429);
    const deleted = await localFetch(`${base}/mcp`, {
      method: 'DELETE',
      headers: {
        host: 'armature.example.test',
        authorization: `Bearer ${alice}`,
        'mcp-session-id': session,
      },
    });
    expect(deleted.status).toBe(200);
    expect((await initialize(alice)).status).toBe(200);
  });
  it('serializes concurrent initialization for the same owner', async () => {
    const access = await token();
    const results = await Promise.all([initialize(access), initialize(access)]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 429]);
  });
  it('allows bounded discovery and conversation connections for one account', async () => {
    const createStore = nodeFiles.createNodeFileStore;
    let releaseWrite!: () => void;
    let startedWrite!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      startedWrite = resolve;
    });
    const writeReleased = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    vi.spyOn(nodeFiles, 'createNodeFileStore').mockImplementation((...args) => {
      const store = createStore(...args);
      return {
        ...store,
        async write(path, content) {
          startedWrite();
          await writeReleased;
          await store.write(path, content);
        },
      };
    });
    await app.close();
    app = await createHttpServer({
      dataRoot: root,
      publicUrl: resource,
      issuer,
      jwksUrl: `${issuer}jwks`,
      maxSessions: 3,
      maxSessionsPerOwner: 2,
    });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('No listening address');
    base = `http://127.0.0.1:${address.port}`;
    const alice = await token();
    const first = await initialize(alice);
    const second = await initialize(alice);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstId = first.headers.get('mcp-session-id')!;
    const secondId = second.headers.get('mcp-session-id')!;
    expect(secondId).not.toBe(firstId);
    expect((await rpc(alice, secondId, 'tools/list')).tools).toHaveLength(toolCatalog().length);
    await call(alice, firstId, 'document.new', { name: 'First connection' });
    await call(alice, secondId, 'document.new', { name: 'Second connection' });
    const bob = await token('bob');
    expect((await initialize(bob)).status).toBe(200);
    expect(
      (await request(bob, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, firstId)).status,
    ).toBe(404);
    expect((await initialize(await token('charlie'))).status).toBe(429);
    const { documentId } = await call(alice, firstId, 'document.new', { name: 'Shared storage' });
    await call(alice, firstId, 'bone.create', { documentId, name: 'root', length: 10 });
    const saving = request(
      alice,
      {
        jsonrpc: '2.0',
        id: ++nextId,
        method: 'tools/call',
        params: { name: 'document.save', arguments: { documentId, path: 'shared.json' } },
      },
      firstId,
    );
    await writeStarted;
    try {
      expect((await initialize(alice)).status).toBe(429);
      expect(
        (await request(alice, { jsonrpc: '2.0', id: ++nextId, method: 'tools/list' }, secondId))
          .status,
      ).toBe(409);
    } finally {
      releaseWrite();
    }
    expect((await saving).status).toBe(200);
    expect(
      (await call(alice, secondId, 'document.open', { path: 'shared.json' })).documentId,
    ).toBeTruthy();
  });
  it('preserves documents and history across repeated transport replacement without crossing accounts', async () => {
    const access = await token();
    const firstId = (await initialize(access)).headers.get('mcp-session-id')!;
    await rpc(access, firstId, 'tools/list');
    const replacement = await initialize(access);
    expect(replacement.status).toBe(200);
    const replacementId = replacement.headers.get('mcp-session-id')!;
    expect(replacementId).not.toBe(firstId);
    expect(
      (await request(access, { jsonrpc: '2.0', id: ++nextId, method: 'tools/list' }, firstId))
        .status,
    ).toBe(404);
    const { documentId } = await call(access, replacementId, 'document.new', { name: 'Preserved' });
    const { boneId } = await call(access, replacementId, 'bone.create', {
      documentId,
      name: 'root',
      length: 10,
    });
    let current = replacementId;
    for (let i = 0; i < 6; i += 1) {
      const fresh = await initialize(access);
      expect(fresh.status).toBe(200);
      current = fresh.headers.get('mcp-session-id')!;
      const bones = await call(access, current, 'bone.list', { documentId });
      expect(JSON.stringify(bones)).toContain(boneId);
    }
    await call(access, current, 'history.undo', { documentId });
    const undone = await call(access, current, 'bone.list', { documentId });
    expect(JSON.stringify(undone)).not.toContain(boneId);
    current = (await initialize(access)).headers.get('mcp-session-id')!;
    await call(access, current, 'history.redo', { documentId });
    expect(JSON.stringify(await call(access, current, 'bone.list', { documentId }))).toContain(
      boneId,
    );
    const bob = await token('bob');
    const other = (await initialize(bob)).headers.get('mcp-session-id')!;
    const foreign = await rpc(bob, other, 'tools/call', {
      name: 'bone.list',
      arguments: { documentId },
    });
    expect(foreign.isError).toBe(true);
    expect(JSON.stringify(foreign)).toContain('DOCUMENT_NOT_FOUND');
    for (let i = 0; i < 3; i += 1) await call(access, current, 'document.new', { name: 'Bounded' });
    current = (await initialize(access)).headers.get('mcp-session-id')!;
    const full = await rpc(access, current, 'tools/call', {
      name: 'document.new',
      arguments: { name: 'Over limit' },
    });
    expect(full.isError).toBe(true);
    expect(JSON.stringify(full)).toContain('SESSION_LIMIT');
  });
  it('expires idle sessions and permits a fresh session', async () => {
    const access = await token();
    const session = (await initialize(access)).headers.get('mcp-session-id')!;
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 31 * 60_000);
    expect(
      (await request(access, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, session)).status,
    ).toBe(404);
    clock.mockRestore();
    expect((await initialize(access)).status).toBe(200);
  });
  it('bounds retained accounts, expires idle documents and never reuses their identifiers', async () => {
    const alice = await token();
    const session = (await initialize(alice)).headers.get('mcp-session-id')!;
    const { documentId } = await call(alice, session, 'document.new', { name: 'Unsaved' });
    await localFetch(`${base}/mcp`, {
      method: 'DELETE',
      headers: {
        host: 'armature.example.test',
        authorization: `Bearer ${alice}`,
        'mcp-session-id': session,
      },
    });
    const reconnected = (await initialize(alice)).headers.get('mcp-session-id')!;
    await call(alice, reconnected, 'bone.list', { documentId });
    await initialize(await token('bob'));
    expect((await initialize(await token('charlie'))).status).toBe(429);
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 31 * 60_000);
    const fresh = (await initialize(alice)).headers.get('mcp-session-id')!;
    const newDocument = await call(alice, fresh, 'document.new', { name: 'After expiry' });
    expect(newDocument.documentId).not.toBe(documentId);
    const stale = await rpc(alice, fresh, 'tools/call', {
      name: 'bone.list',
      arguments: { documentId },
    });
    expect(stale.isError).toBe(true);
    expect(JSON.stringify(stale)).toContain('DOCUMENT_NOT_FOUND');
    expect((await initialize(await token('charlie'))).status).toBe(200);
    clock.mockRestore();
  });
  it('preserves saved files after deleting a transport session', async () => {
    const access = await token();
    const session = (await initialize(access)).headers.get('mcp-session-id')!;
    const { documentId } = await call(access, session, 'document.new', { name: 'Saved session' });
    await call(access, session, 'bone.create', { documentId, name: 'root', length: 10 });
    const saved = await call(access, session, 'document.export', { documentId });
    await call(access, session, 'document.save', { documentId, path: 'saved.json' });
    await localFetch(`${base}/mcp`, {
      method: 'DELETE',
      headers: {
        host: 'armature.example.test',
        authorization: `Bearer ${access}`,
        'mcp-session-id': session,
      },
    });
    const fresh = (await initialize(access)).headers.get('mcp-session-id')!;
    const opened = await call(access, fresh, 'document.open', { path: 'saved.json' });
    expect(await call(access, fresh, 'document.export', { documentId: opened.documentId })).toEqual(
      saved,
    );
  });
  it('edits, undoes, redoes, saves and reopens without leaking tenant files', async () => {
    const alice = await token();
    const session = (await initialize(alice)).headers.get('mcp-session-id')!;
    const catalog = await rpc(alice, session, 'tools/list');
    expect(catalog.tools).toHaveLength(215);
    const expectedOutputs = new Map(toolCatalog().map((tool) => [tool.name, tool.outputSchema]));
    for (const tool of catalog.tools) {
      expect(tool.outputSchema).toEqual(expectedOutputs.get(tool.name));
      expect(tool.outputSchema.type).toBe('object');
      expect(Object.keys(tool.outputSchema.properties).length).toBeGreaterThan(0);
    }
    for (const tool of catalog.tools) {
      expect(tool.annotations).toEqual({
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        openWorldHint: false,
      });
    }
    // These are permission decisions a real client makes from the wire catalog.
    const annotations = (name: string) =>
      catalog.tools.find((tool: { name: string }) => tool.name === name).annotations;
    expect(annotations('render_frame').readOnlyHint).toBe(true);
    expect(annotations('document.export').readOnlyHint).toBe(true);
    expect(annotations('document.open')).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
    expect(annotations('bone.create').destructiveHint).toBe(false);
    for (const name of [
      'bone.move',
      'bone.delete',
      'document.save',
      'document.close',
      'atlas.pack',
    ]) {
      expect(annotations(name)).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    }
    const { documentId } = await call(alice, session, 'document.new', { name: 'HTTP rig' });
    const { boneId } = await call(alice, session, 'bone.create', {
      documentId,
      name: 'root',
      length: 50,
    });
    const before = await call(alice, session, 'document.export', { documentId });
    await call(alice, session, 'bone.move', { documentId, boneId, x: 30, y: 0 });
    const changed = await call(alice, session, 'document.export', { documentId });
    expect(changed).not.toEqual(before);
    await call(alice, session, 'history.undo', { documentId });
    expect(await call(alice, session, 'document.export', { documentId })).toEqual(before);
    await call(alice, session, 'history.redo', { documentId });
    expect(await call(alice, session, 'document.export', { documentId })).toEqual(changed);
    await call(alice, session, 'document.save', { documentId, path: 'rig.json' });
    const reopened = await call(alice, session, 'document.open', { path: 'rig.json' });
    expect(
      await call(alice, session, 'document.export', { documentId: reopened.documentId }),
    ).toEqual(changed);
    const denied = await rpc(alice, session, 'tools/call', {
      name: 'document.save',
      arguments: { documentId, path: '../escape.json' },
    });
    expect(denied.isError).toBe(true);
    expect(denied.structuredContent).toBeUndefined();
    expect(JSON.parse(denied.content[0].text)).toEqual({
      code: 'PATH_FORBIDDEN',
      message: 'Tool operation failed',
    });
    const bob = await token('bob');
    const other = (await initialize(bob)).headers.get('mcp-session-id')!;
    const missing = await rpc(bob, other, 'tools/call', {
      name: 'document.open',
      arguments: { path: 'rig.json' },
    });
    expect(missing.isError).toBe(true);
    expect(JSON.stringify(missing)).not.toContain(root);
  });
});
