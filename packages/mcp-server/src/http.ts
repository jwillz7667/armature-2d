import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, mkdir, realpath } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { buildMcpServer } from './server';
import { createNodeFileStore } from './node-files';
import { SessionRegistry } from './session';

export interface HttpOptions {
  readonly dataRoot: string;
  readonly publicUrl: string;
  readonly issuer: string;
  readonly jwksUrl: string;
  readonly allowedOrigins?: readonly string[];
  readonly maxSessions?: number;
  readonly idleMs?: number;
}

function httpsUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Public and OAuth URLs must be HTTPS without credentials, query or fragment');
  }
  return url;
}

// This is an OAuth resource server, not an authorization server. The configured issuer must
// provide the login, PKCE and client registration flow. No client can select an issuer or root.
export async function createHttpServer(options: HttpOptions) {
  const resource = httpsUrl(options.publicUrl);
  if (resource.pathname !== '/mcp') throw new Error('publicUrl must end in /mcp');
  httpsUrl(options.issuer);
  const keys = createRemoteJWKSet(httpsUrl(options.jwksUrl));
  const maxSessions = options.maxSessions ?? 32;
  const idleMs = options.idleMs ?? 30 * 60_000;
  if (
    !Number.isSafeInteger(maxSessions) ||
    maxSessions < 1 ||
    !Number.isSafeInteger(idleMs) ||
    idleMs < 1
  ) {
    throw new Error('Session limits must be positive integers');
  }
  await mkdir(options.dataRoot, { recursive: true, mode: 0o700 });
  const dataRoot = await realpath(options.dataRoot);
  // Fail startup before advertising a healthy server if a mounted volume is unusable.
  await access(dataRoot, constants.W_OK | constants.X_OK);
  const metadataUrl = `${resource.origin}/.well-known/oauth-protected-resource/mcp`;
  const metadata = {
    resource: resource.href,
    authorization_servers: [options.issuer],
    scopes_supported: ['armature:edit'],
    bearer_methods_supported: ['header'],
  };
  type Entry = {
    owner: string;
    transport: StreamableHTTPServerTransport;
    server: ReturnType<typeof buildMcpServer>;
    busy: boolean;
    used: number;
  };
  const sessions = new Map<string, Entry>();
  // Reserve capacity before asynchronous filesystem operations.
  const pendingOwners = new Set<string>();
  let closing = false;
  const send = (res: ServerResponse, status: number, error: string) => {
    if (!res.headersSent)
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    if (!res.writableEnded) res.end(JSON.stringify({ error }));
  };
  const dispose = async (id: string, entry: Entry) => {
    sessions.delete(id);
    await entry.server.close();
  };
  const timer = setInterval(
    () => {
      const now = Date.now();
      for (const [id, entry] of sessions) {
        if (!entry.busy && now - entry.used > idleMs) void dispose(id, entry).catch(() => {});
      }
    },
    Math.min(idleMs, 60_000),
  );
  timer.unref();

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'GET' && req.url === '/healthz') {
      send(res, closing ? 503 : 200, closing ? 'stopping' : 'ok');
      return;
    }
    if (
      req.headers.host !== resource.host ||
      (req.headers.origin !== undefined &&
        ![resource.origin, ...(options.allowedOrigins ?? [])].includes(req.headers.origin))
    ) {
      send(res, 403, 'Forbidden host or origin');
      return;
    }
    if (
      req.method === 'GET' &&
      (req.url === '/.well-known/oauth-protected-resource/mcp' ||
        req.url === '/.well-known/oauth-protected-resource')
    ) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(metadata));
      return;
    }
    if (req.url !== '/mcp') {
      send(res, 404, 'Not found');
      return;
    }
    if (closing) {
      send(res, 503, 'Stopping');
      return;
    }
    let owner: string;
    try {
      const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '');
      if (!match?.[1]) throw new Error('Missing token');
      const { payload } = await jwtVerify(match[1], keys, {
        issuer: options.issuer,
        audience: resource.href,
        algorithms: ['RS256', 'ES256'],
        requiredClaims: ['exp', 'sub', 'iat'],
      });
      if (typeof payload.sub !== 'string' || !payload.sub.trim())
        throw new Error('Missing subject');
      if (
        typeof payload.scope !== 'string' ||
        !payload.scope.split(' ').includes('armature:edit')
      ) {
        res.setHeader(
          'WWW-Authenticate',
          'Bearer error="insufficient_scope", scope="armature:edit"',
        );
        send(res, 403, 'Insufficient scope');
        return;
      }
      owner = createHash('sha256')
        .update(JSON.stringify([options.issuer, payload.sub]))
        .digest('hex');
    } catch {
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${metadataUrl}"`);
      send(res, 401, 'Authentication required');
      return;
    }
    // There are no server-initiated notifications, so standalone SSE is intentionally unsupported.
    if (req.method !== 'POST' && req.method !== 'DELETE') {
      res.setHeader('Allow', 'POST, DELETE');
      send(res, 405, 'Method not allowed');
      return;
    }
    let body: unknown;
    if (req.method === 'POST') {
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
        send(res, 415, 'Expected JSON');
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
        size += bytes.length;
        if (size > 1024 * 1024) {
          send(res, 413, 'Request too large');
          return;
        }
        chunks.push(bytes);
      }
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
      } catch {
        send(res, 400, 'Invalid JSON');
        return;
      }
      if (Array.isArray(body)) {
        send(res, 400, 'Batch requests are not supported');
        return;
      }
    }
    const id = req.headers['mcp-session-id'];
    let entry: Entry;
    let sessionKey: string;
    if (id !== undefined) {
      const existing = typeof id === 'string' ? sessions.get(id) : undefined;
      if (!existing || existing.owner !== owner) {
        send(res, 404, 'Session not found');
        return;
      }
      if (!existing.busy && Date.now() - existing.used > idleMs) {
        await dispose(id as string, existing);
        send(res, 404, 'Session expired');
        return;
      }
      if (existing.busy) {
        send(res, 409, 'Session is busy; retry after the current request');
        return;
      }
      sessionKey = id as string;
      entry = existing;
      entry.busy = true;
    } else {
      if (req.method !== 'POST' || !isInitializeRequest(body)) {
        send(res, 400, 'Initialize a session first');
        return;
      }
      if (
        sessions.size + pendingOwners.size >= maxSessions ||
        pendingOwners.has(owner) ||
        [...sessions.values()].some((session) => session.owner === owner)
      ) {
        send(res, 429, 'Session capacity reached');
        return;
      }
      pendingOwners.add(owner);
      try {
        const root = join(dataRoot, owner);
        await mkdir(root, { recursive: true, mode: 0o700 });
        if (!(await lstat(root)).isDirectory() || (await realpath(root)) !== root)
          throw new Error('Invalid tenant directory');
        if (closing) {
          send(res, 503, 'Stopping');
          return;
        }
        const server = buildMcpServer(
          { sessions: new SessionRegistry(4), files: createNodeFileStore(root) },
          undefined,
          { redactErrors: true },
        );
        sessionKey = randomUUID();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionKey,
          enableJsonResponse: true,
        });
        entry = { owner, server, transport, busy: true, used: Date.now() };
        // SDK 1.30 declares the same optional callbacks differently on these interfaces.
        await server.connect(transport as Transport);
        sessions.set(sessionKey, entry);
      } finally {
        pendingOwners.delete(owner);
      }
    }
    // Keep the mutation lock until the response ends; the SDK can return before a tool completes.
    const completed = new Promise<void>((resolve) => {
      res.once('finish', resolve);
      res.once('close', resolve);
    });
    try {
      await entry.transport.handleRequest(req, res, body);
      await completed;
    } catch (error) {
      sessions.delete(sessionKey);
      await entry.server.close();
      throw error;
    } finally {
      entry.busy = false;
      entry.used = Date.now();
      if (req.method === 'DELETE' || !entry.transport.sessionId) {
        sessions.delete(sessionKey);
        await entry.server.close();
      }
    }
  };
  const server = createServer((req, res) => {
    void handler(req, res).catch(() => send(res, 500, 'Internal server error'));
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return {
    server,
    async close() {
      closing = true;
      clearInterval(timer);
      await Promise.all([...sessions.entries()].map(([id, entry]) => dispose(id, entry)));
      server.closeAllConnections();
      if (server.listening)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
    },
  };
}
