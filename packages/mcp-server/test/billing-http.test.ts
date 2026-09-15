import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpServer } from '../src/http';
import { BillingController, createBilling } from '../src/billing/http';
import { accountOwner, digest } from '../src/billing/store';
import { billingFixture, config, subscription } from './billing-fixture';

const issuer = 'https://identity.example.test/realms/armature';
const resource = `${config.origin}/mcp`;
const auth = {
  issuer,
  resource,
  jwks: `${issuer}/certs`,
  authorization: `${issuer}/auth`,
  token: `${issuer}/token`,
  clientId: 'armature-billing',
};
const owner = accountOwner(issuer, 'alice');
const pair = await generateKeyPair('ES256');
const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'billing-key', alg: 'ES256', use: 'sig' };
let f: ReturnType<typeof billingFixture>;
let app: Awaited<ReturnType<typeof createHttpServer>>;
let root: string, base: string, nonce: string;
let badClaim: string | null;
let exchanges: URLSearchParams[];
async function jwt(subject: string, audience: string, extra: Record<string, unknown> = {}) {
  return new SignJWT(extra)
    .setProtectedHeader({ alg: 'ES256', kid: 'billing-key' })
    .setSubject(subject)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(pair.privateKey);
}
async function request(path: string, headers: Record<string, string> = {}, body?: string) {
  return new Promise<Response>((resolve, reject) => {
    const req = httpRequest(
      `${base}${path}`,
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: { host: new URL(config.origin).host, ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode!,
              headers: Object.fromEntries(
                Object.entries(res.headers)
                  .filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
                  .map(([key, value]) => [key, Array.isArray(value) ? value.join('; ') : value]),
              ),
            }),
          ),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}
const responseCookie = (res: Response) => res.headers.get('set-cookie')!.split(';')[0]!;
async function startLogin() {
  const response = await request('/billing/login');
  expect(response.status).toBe(303);
  const redirect = new URL(response.headers.get('location')!);
  nonce = redirect.searchParams.get('nonce')!;
  return {
    response,
    redirect,
    cookie: responseCookie(response),
    state: redirect.searchParams.get('state')!,
  };
}
function callback(state: string, extra = '') {
  return `/billing/callback?${new URLSearchParams({ state, code: 'test-code', iss: issuer })}${extra}`;
}
async function login() {
  const start = await startLogin();
  const response = await request(callback(start.state), { cookie: start.cookie });
  expect(response.status).toBe(303);
  const cookie = responseCookie(response);
  const account = await (await request('/billing/account', { cookie })).json();
  return { cookie, csrf: account.csrf as string, account };
}
function mutationHeaders(session: { cookie: string; csrf: string }) {
  return {
    cookie: session.cookie,
    'x-csrf-token': session.csrf,
    origin: config.origin,
    'content-type': 'application/json',
  };
}
beforeEach(async () => {
  f = billingFixture();
  nonce = '';
  badClaim = null;
  exchanges = [];
  vi.stubGlobal(
    'fetch',
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (String(input) === auth.jwks) return Response.json({ keys: [jwk] });
      if (String(input) === auth.token) {
        const body = new URLSearchParams(String(init?.body));
        exchanges.push(body);
        const id = await jwt('alice', badClaim === 'audience' ? 'attacker-client' : auth.clientId, {
          nonce: badClaim === 'nonce' ? 'wrong' : nonce,
          ...(badClaim === 'azp' ? { azp: 'attacker-client' } : {}),
        });
        const access = await jwt(
          badClaim === 'subject' ? 'bob' : 'alice',
          badClaim === 'resource' ? 'https://attacker.test/mcp' : resource,
          { scope: badClaim === 'scope' ? 'openid' : 'armature:edit' },
        );
        return Response.json({ id_token: id, access_token: access, token_type: 'Bearer' });
      }
      throw new Error('Unexpected OAuth network destination');
    },
  );
  root = await mkdtemp(join(tmpdir(), 'armature-billing-http-'));
  app = await createHttpServer({
    dataRoot: root,
    publicUrl: resource,
    issuer,
    jwksUrl: auth.jwks,
    createBilling: async () => new BillingController(f.service, auth),
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  await app.close();
  await rm(root, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('billing authentication and HTTP boundaries', () => {
  it('binds PKCE, state and nonce to a single-use secure cookie and discards OAuth tokens', async () => {
    const start = await startLogin();
    expect(start.response.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Lax');
    expect(start.redirect.origin).toBe(new URL(issuer).origin);
    expect(start.redirect.searchParams.get('redirect_uri')).toBe(
      `${config.origin}/billing/callback`,
    );
    expect(start.redirect.searchParams.get('code_challenge_method')).toBe('S256');
    const pending = f.store.session(start.state, 'login', f.now())!;
    expect(start.redirect.searchParams.get('code_challenge')).toBe(
      Buffer.from(digest(pending.verifier), 'hex').toString('base64url'),
    );
    const response = await request(callback(start.state), { cookie: start.cookie });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${config.origin}/billing`);
    expect(exchanges[0]!.get('code_verifier')).toBe(pending.verifier);
    const session = responseCookie(response);
    expect(session).not.toBe(start.cookie);
    const account = await (await request('/billing/account', { cookie: session })).json();
    expect(account).toMatchObject({
      enabled: true,
      signedIn: true,
      billing: { active: false, trialEligible: true },
    });
    expect(JSON.stringify(account)).not.toMatch(/id_token|access_token|cus_|sk_test/);
    expect((await request(callback(start.state), { cookie: start.cookie })).status).toBe(400);
    expect(exchanges).toHaveLength(1);
  });
  it('rejects missing, mismatched, duplicate and expired login state before token exchange', async () => {
    const start = await startLogin();
    for (const [path, cookie] of [
      [callback(start.state), ''],
      [callback('wrong'), start.cookie],
      [callback(start.state, `&state=${start.state}`), start.cookie],
      [callback(start.state), `${start.cookie}; ${start.cookie}`],
    ]) {
      expect((await request(path!, { cookie: cookie! })).status).toBe(400);
    }
    f.advance(601);
    expect((await request(callback(start.state), { cookie: start.cookie })).status).toBe(400);
    expect(exchanges).toHaveLength(0);
  });
  it('rejects an issuer mix-up and consumes the failed callback', async () => {
    const start = await startLogin();
    expect(
      (
        await request(
          callback(start.state).replace(
            encodeURIComponent(issuer),
            encodeURIComponent('https://attacker.test'),
          ),
          { cookie: start.cookie },
        )
      ).status,
    ).toBe(400);
    expect((await request(callback(start.state), { cookie: start.cookie })).status).toBe(400);
    expect(exchanges).toHaveLength(0);
  });
  it.each(['nonce', 'audience', 'azp', 'resource', 'subject', 'scope'])(
    'rejects signed OAuth tokens with invalid %s',
    async (claim) => {
      badClaim = claim;
      const start = await startLogin();
      const response = await request(callback(start.state), { cookie: start.cookie });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: 'BILLING_UNAVAILABLE' });
      expect(
        (await (await request('/billing/account', { cookie: start.cookie })).json()).signedIn,
      ).toBe(false);
    },
  );
  it('requires an authenticated session, same origin and CSRF token before creating checkout', async () => {
    const session = await login();
    const headers = mutationHeaders(session);
    expect(
      (await request('/billing/checkout', { ...headers, cookie: '' }, '{"plan":"monthly"}')).status,
    ).toBe(401);
    for (const values of [
      { origin: 'https://attacker.test' },
      { origin: '' },
      { 'x-csrf-token': '' },
      { 'x-csrf-token': 'é'.repeat(43) },
    ]) {
      expect(
        (await request('/billing/checkout', { ...headers, ...values }, '{"plan":"monthly"}'))
          .status,
      ).toBe(403);
    }
    expect(f.calls).toHaveLength(0);
    const valid = await request('/billing/checkout', headers, '{"plan":"monthly"}');
    expect(valid.status).toBe(200);
    expect(
      f.calls.find((call) => call.path === '/v1/checkout/sessions')!.body.get('customer'),
    ).toBe(`cus_${owner}`);
  });
  it('rejects client-selected prices, customers, return URLs and excess input', async () => {
    const headers = mutationHeaders(await login());
    for (const data of [
      { plan: 'free' },
      { plan: 'monthly', priceId: 'price_cheaper' },
      { plan: 'monthly', customerId: 'cus_victim' },
      { plan: 'yearly', return_url: 'https://attacker.test' },
    ]) {
      expect((await request('/billing/checkout', headers, JSON.stringify(data))).status).toBe(400);
    }
    expect((await request('/billing/portal', headers, '{"customer":"cus_victim"}')).status).toBe(
      400,
    );
    expect(
      (await request('/billing/checkout', { ...headers, 'content-type': 'text/plain' }, '{}'))
        .status,
    ).toBe(415);
    expect(
      (await request('/billing/checkout', headers, JSON.stringify({ plan: 'x'.repeat(5000) })))
        .status,
    ).toBe(413);
    expect(f.calls).toHaveLength(0);
  });
  it('invalidates sessions on logout and expiry and rate-limits authenticated billing actions', async () => {
    const session = await login();
    const headers = mutationHeaders(session);
    f.seed(owner);
    for (let n = 0; n < 10; n++)
      expect((await request('/billing/portal', headers, '{}')).status).toBe(200);
    expect((await request('/billing/portal', headers, '{}')).status).toBe(429);
    f.advance(61);
    expect((await request('/billing/portal', headers, '{}')).status).toBe(200);
    expect((await request('/billing/logout', headers, '{}')).status).toBe(200);
    expect((await request('/billing/portal', headers, '{}')).status).toBe(401);
    const fresh = await login();
    f.advance(1801);
    expect(
      (await request('/billing/checkout', mutationHeaders(fresh), '{"plan":"monthly"}')).status,
    ).toBe(401);
  });
  it('bounds anonymous logins without trusting proxy headers', async () => {
    for (let n = 0; n < 60; n++)
      expect((await request('/billing/login', { 'x-forwarded-for': `192.0.2.${n}` })).status).toBe(
        303,
      );
    expect((await request('/billing/login', { 'x-forwarded-for': '198.51.100.1' })).status).toBe(
      429,
    );
    f.advance(61);
    expect((await request('/billing/login')).status).toBe(303);
  });
  it('verifies webhook raw bytes and redacts upstream errors', async () => {
    f.seed(owner);
    const e = f.event('invoice.paid', 'evt_http', `cus_${owner}`);
    expect((await request('/billing/webhook', {}, e.body.toString())).status).toBe(400);
    const headers = { 'stripe-signature': e.signature, 'content-type': 'application/json' };
    expect((await request('/billing/webhook', headers, `${e.body.toString()} `)).status).toBe(400);
    f.failSubscriptions();
    const failed = await request('/billing/webhook', headers, e.body.toString());
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain('Upstream');
    expect(f.store.eventSeen('evt_http')).toBe(false);
    f.failSubscriptions(false);
    expect((await request('/billing/webhook', headers, e.body.toString())).status).toBe(200);
    expect(f.store.eventSeen('evt_http')).toBe(true);
  });
  it('serves a protected account UI without trusting checkout success query parameters', async () => {
    const response = await request('/billing?checkout=complete&session_id=cs_attacker');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toContain('$360');
    expect((await (await request('/billing/account?checkout=complete')).json()).signedIn).toBe(
      false,
    );
    expect((await request('/billing', { host: 'attacker.test' })).status).toBe(403);
  });
});

describe('paid MCP access', () => {
  it('does not silently disable billing when an initialized volume loses its configuration', async () => {
    await writeFile(join(root, '.armature-billing.sqlite'), 'existing billing state');
    await expect(
      createHttpServer({ dataRoot: root, publicUrl: resource, issuer, jwksUrl: auth.jwks }),
    ).rejects.toThrow('Configure billing');
  });
  it('checks entitlement on each tool call and preserves document recovery after trial expiry', async () => {
    const access = await jwt('alice', resource, { scope: 'armature:edit' });
    const headers = {
      authorization: `Bearer ${access}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    let id = 0;
    const rpc = (method: string, params: unknown) =>
      request('/mcp', headers, JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }));
    const initialized = await rpc('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'billing-test', version: '1' },
    });
    expect(initialized.status).toBe(200);
    Object.assign(headers, { 'mcp-session-id': initialized.headers.get('mcp-session-id')! });
    expect((await rpc('tools/list', {})).status).toBe(200);
    expect(
      (await rpc('tools/call', { name: 'document.new', arguments: { name: 'Paid rig' } })).status,
    ).toBe(402);
    f.seed(owner);
    f.histories.set(`cus_${owner}`, [subscription('trialing', config.monthlyPrice, f.now())]);
    const created = await rpc('tools/call', {
      name: 'document.new',
      arguments: { name: 'Paid rig' },
    });
    expect(created.status).toBe(200);
    const result = (await created.json()).result;
    expect(result.isError).not.toBe(true);
    const { documentId } = JSON.parse(result.content[0].text);
    const bone = await rpc('tools/call', {
      name: 'bone.create',
      arguments: { documentId, name: 'root', length: 10 },
    });
    expect((await bone.json()).result.isError).not.toBe(true);
    f.advance(3 * 86400 + 1);
    expect(
      (await rpc('tools/call', { name: 'bone.create', arguments: { documentId, name: 'denied' } }))
        .status,
    ).toBe(402);
    const saved = await rpc('tools/call', {
      name: 'document.save',
      arguments: { documentId, path: 'recovery.json' },
    });
    const savedResult = (await saved.json()).result;
    expect(savedResult.isError, JSON.stringify(savedResult)).not.toBe(true);
    expect(
      (await rpc('tools/call', { name: 'document.open', arguments: { path: 'recovery.json' } }))
        .status,
    ).toBe(200);
    const downloaded = await rpc('tools/call', {
      name: 'workspace.download',
      arguments: { path: 'recovery.json' },
    });
    expect(downloaded.status).toBe(200);
    expect((await downloaded.json()).result.isError).not.toBe(true);
    expect((await rpc('tools/call', { name: 'workspace.list', arguments: {} })).status).toBe(200);
    expect(
      (
        await rpc('tools/call', {
          name: 'workspace.upload',
          arguments: { filename: 'new.json', base64: 'e30=' },
        })
      ).status,
    ).toBe(402);
    f.failSubscriptions();
    expect(
      (await rpc('tools/call', { name: 'bone.create', arguments: { documentId } })).status,
    ).toBe(503);
    expect(
      (await rpc('tools/call', { name: 'document.export', arguments: { documentId } })).status,
    ).toBe(200);
    const anonymous = await request(
      '/mcp',
      { 'content-type': 'application/json' },
      JSON.stringify({
        jsonrpc: '2.0',
        id: 100,
        method: 'tools/call',
        params: { name: 'document.export', arguments: { documentId } },
      }),
    );
    expect(anonymous.status).toBe(401);
  });
  it('refuses test billing in production and a Stripe key from the wrong mode', async () => {
    await expect(
      createBilling(root, resource, issuer, auth.jwks, {
        ARMATURE_BILLING_MODE: 'test',
        NODE_ENV: 'production',
      }),
    ).rejects.toThrow('non-production');
    await expect(
      createBilling(root, resource, issuer, auth.jwks, {
        ARMATURE_BILLING_MODE: 'live',
        STRIPE_SECRET_KEY: 'sk_test_fixture',
      }),
    ).rejects.toThrow('does not match');
  });
});
