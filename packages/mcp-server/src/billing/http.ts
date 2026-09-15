import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import Stripe from 'stripe';
import { z } from 'zod';
import { BillingError, BillingService, type BillingConfig } from './service';
import { BillingStore, accountOwner, digest, randomToken } from './store';

const cookieName = '__Host-armature-billing';
const recoveryTools = new Set([
  'project.open',
  'project.export',
  'project.save',
  'workspace.list',
  'workspace.download',
  'workspace.deleteFile',
  'document.open',
  'document.export',
  'document.save',
  'document.getSnapshot',
  'document.validate',
  'document.close',
]);
const equal = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const checkoutInput = z.object({ plan: z.enum(['monthly', 'yearly']) }).strict();
const emptyInput = z.object({}).strict();
const tokenShape = z.object({
  id_token: z.string(),
  access_token: z.string(),
  token_type: z.string(),
});
export interface BillingHttp {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  authorizeTool(owner: string, name: string): Promise<boolean>;
  close(): Promise<void>;
}
export function billingJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(JSON.stringify(body));
}
function cookie(req: IncomingMessage) {
  const matches = (req.headers.cookie ?? '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.startsWith(`${cookieName}=`));
  if (matches.length !== 1) return null;
  const token = matches[0]!.slice(cookieName.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
function setCookie(res: ServerResponse, token: string, seconds: number) {
  res.setHeader(
    'Set-Cookie',
    `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`,
  );
}
function redirect(res: ServerResponse, location: string) {
  res.writeHead(303, {
    Location: location,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
  res.end();
}
async function readBody(req: IncomingMessage, maxBytes: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += bytes.length;
    if (size > maxBytes) throw new BillingError(413, 'BODY_TOO_LARGE', 'Request is too large.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}
export class BillingController implements BillingHttp {
  private readonly pending = new Set<Promise<unknown>>();
  private readonly rates = new Map<string, { count: number; expires: number }>();
  private closing = false;
  private readonly keys;
  constructor(
    readonly service: BillingService,
    readonly auth: {
      issuer: string;
      jwks: string;
      authorization: string;
      token: string;
      clientId: string;
      resource: string;
    },
  ) {
    this.keys = createRemoteJWKSet(new URL(auth.jwks));
  }
  private rateLimit(key: string, limit: number) {
    const now = this.service.now();
    for (const [id, value] of this.rates) {
      if (value.expires <= now) this.rates.delete(id);
    }
    const window = this.rates.get(key) ?? { count: 0, expires: now + 60 };
    if (window.count >= limit || (!this.rates.has(key) && this.rates.size >= 2048))
      throw new BillingError(
        429,
        'BILLING_RATE_LIMIT',
        'Too many billing requests. Try again in a minute.',
      );
    window.count++;
    this.rates.set(key, window);
  }
  private async tracked<T>(task: () => Promise<T>): Promise<T> {
    if (this.closing)
      throw new BillingError(503, 'STOPPING', 'Billing is restarting. Please retry shortly.');
    const promise = task();
    this.pending.add(promise);
    try {
      return await promise;
    } finally {
      this.pending.delete(promise);
    }
  }
  async close() {
    this.closing = true;
    await Promise.allSettled([...this.pending]);
    this.service.store.close();
  }
  async authorizeTool(owner: string, name: string) {
    if (recoveryTools.has(name)) return true;
    return this.tracked(() => this.service.entitled(owner));
  }
  async handle(req: IncomingMessage, res: ServerResponse) {
    try {
      await this.tracked(() => this.route(req, res));
    } catch (error) {
      // No Stripe error payloads, document paths, OAuth codes or secrets reach clients/logs.
      if (!res.headersSent && !res.writableEnded)
        billingJson(res, error instanceof BillingError ? error.status : 503, {
          code: error instanceof BillingError ? error.code : 'BILLING_UNAVAILABLE',
          message:
            error instanceof BillingError
              ? error.message
              : 'Billing is temporarily unavailable. Please retry.',
        });
    }
  }
  private async route(req: IncomingMessage, res: ServerResponse) {
    const { service } = this;
    const { store } = service;
    const now = service.now();
    const url = new URL(req.url!, service.config.origin);
    // Called after the common HTTP host/origin guard. Independently enforce it for reuse/tests.
    if (req.headers.host !== new URL(service.config.origin).host)
      throw new BillingError(403, 'HOST_FORBIDDEN', 'Forbidden host.');
    if (req.method === 'POST' && url.pathname === '/billing/webhook') {
      if (url.search) throw new BillingError(400, 'INVALID_WEBHOOK', 'Unexpected webhook query.');
      const signature = req.headers['stripe-signature'];
      if (typeof signature !== 'string' || signature.length > 4096)
        throw new BillingError(400, 'INVALID_SIGNATURE', 'Missing webhook signature.');
      await service.webhook(await readBody(req, 512 * 1024), signature);
      billingJson(res, 200, { received: true });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/billing/login') {
      // A global budget bounds anonymous login storage without trusting spoofable proxy IP headers.
      this.rateLimit('login', 60);
      const old = cookie(req);
      if (old) store.deleteSession(old);
      const state = randomToken(),
        verifier = randomToken(),
        nonce = randomToken();
      store.putSession(state, 'login', now + 600, { verifier, nonce }, now);
      setCookie(res, state, 600);
      const authorization = new URL(this.auth.authorization);
      authorization.search = new URLSearchParams({
        client_id: this.auth.clientId,
        redirect_uri: `${service.config.origin}/billing/callback`,
        response_type: 'code',
        scope: 'openid armature:edit',
        state,
        nonce,
        code_challenge: Buffer.from(digest(verifier), 'hex').toString('base64url'),
        code_challenge_method: 'S256',
        resource: this.auth.resource,
      }).toString();
      redirect(res, authorization.href);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/billing/callback') {
      const state = url.searchParams.get('state'),
        token = cookie(req);
      const login = token ? store.session(token, 'login', now) : null;
      if (
        !state ||
        !token ||
        !login ||
        !equal(state, token) ||
        url.searchParams.getAll('state').length !== 1
      )
        throw new BillingError(
          400,
          'INVALID_LOGIN_STATE',
          'Sign-in expired or could not be verified. Start sign-in again.',
        );
      store.deleteSession(token);
      setCookie(res, '', 0);
      if (url.searchParams.has('error'))
        throw new BillingError(
          400,
          'LOGIN_CANCELED',
          'Sign-in was canceled. You can start again from billing.',
        );
      if (
        url.searchParams.getAll('iss').length !== 1 ||
        url.searchParams.get('iss') !== this.auth.issuer ||
        url.searchParams.getAll('code').length !== 1
      )
        throw new BillingError(
          400,
          'INVALID_AUTH_RESPONSE',
          'The sign-in response could not be verified.',
        );
      const code = url.searchParams.get('code');
      if (!code || code.length > 4096)
        throw new BillingError(
          400,
          'INVALID_AUTH_RESPONSE',
          'The sign-in response could not be verified.',
        );
      const response = await fetch(this.auth.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: this.auth.clientId,
          redirect_uri: `${service.config.origin}/billing/callback`,
          code_verifier: login.verifier,
          resource: this.auth.resource,
        }),
      });
      if (!response.ok)
        throw new BillingError(
          401,
          'LOGIN_FAILED',
          'Sign-in could not be completed. Please start again.',
        );
      const tokens = tokenShape.parse(await response.json());
      if (tokens.token_type.toLowerCase() !== 'bearer') throw new Error('Unexpected token type');
      const { payload: identity } = await jwtVerify(tokens.id_token, this.keys, {
        issuer: this.auth.issuer,
        audience: this.auth.clientId,
        algorithms: ['RS256', 'ES256'],
        requiredClaims: ['iat', 'exp', 'sub', 'nonce'],
        maxTokenAge: '10m',
      });
      const { payload: access } = await jwtVerify(tokens.access_token, this.keys, {
        issuer: this.auth.issuer,
        audience: this.auth.resource,
        algorithms: ['RS256', 'ES256'],
        requiredClaims: ['iat', 'exp', 'sub'],
      });
      if (
        identity.nonce !== login.nonce ||
        typeof identity.sub !== 'string' ||
        !identity.sub.trim() ||
        access.sub !== identity.sub ||
        (identity.azp !== undefined && identity.azp !== this.auth.clientId) ||
        (Array.isArray(identity.aud) &&
          identity.aud.length > 1 &&
          identity.azp !== this.auth.clientId) ||
        typeof access.scope !== 'string' ||
        !access.scope.split(' ').includes('armature:edit')
      )
        throw new Error('Invalid OAuth identity');
      const session = randomToken();
      store.putSession(
        session,
        'account',
        now + 1800,
        { owner: accountOwner(this.auth.issuer, identity.sub), csrf: randomToken() },
        now,
      );
      // OAuth access / ID tokens are discarded. The browser receives only an opaque HttpOnly cookie.
      setCookie(res, session, 1800);
      redirect(res, `${service.config.origin}/billing`);
      return;
    }
    const token = cookie(req),
      session = token ? store.session(token, 'account', now) : null;
    if (req.method === 'GET' && url.pathname === '/billing/account') {
      billingJson(
        res,
        200,
        session
          ? {
              enabled: true,
              signedIn: true,
              csrf: session.csrf,
              billing: await service.status(session.owner),
            }
          : { enabled: true, signedIn: false },
      );
      return;
    }
    if (
      req.method !== 'POST' ||
      !['/billing/checkout', '/billing/portal', '/billing/logout'].includes(url.pathname)
    ) {
      billingJson(res, 404, { message: 'Not found.' });
      return;
    }
    if (!session)
      throw new BillingError(401, 'SIGN_IN_REQUIRED', 'Sign in to your Armature account first.');
    const csrf = req.headers['x-csrf-token'];
    if (
      req.headers.origin !== service.config.origin ||
      typeof csrf !== 'string' ||
      !equal(csrf, session.csrf)
    )
      throw new BillingError(
        403,
        'CSRF_REJECTED',
        'This billing request could not be verified. Refresh and try again.',
      );
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? ''))
      throw new BillingError(415, 'JSON_REQUIRED', 'Expected JSON.');
    let raw: unknown;
    try {
      raw = JSON.parse((await readBody(req, 4096)).toString('utf8'));
    } catch (error) {
      if (error instanceof BillingError) throw error;
      throw new BillingError(400, 'INVALID_INPUT', 'Invalid billing request.');
    }
    if (url.pathname === '/billing/checkout') {
      const input = checkoutInput.safeParse(raw);
      if (!input.success) throw new BillingError(400, 'INVALID_PLAN', 'Choose monthly or yearly.');
      this.rateLimit(`account:${session.owner}`, 10);
      billingJson(res, 200, { url: await service.checkout(session.owner, input.data.plan) });
      return;
    }
    if (!emptyInput.safeParse(raw).success)
      throw new BillingError(400, 'INVALID_INPUT', 'Unexpected billing fields.');
    if (url.pathname === '/billing/portal') {
      this.rateLimit(`account:${session.owner}`, 10);
      billingJson(res, 200, { url: await service.portal(session.owner) });
      return;
    }
    store.deleteSession(token!);
    setCookie(res, '', 0);
    billingJson(res, 200, { signedOut: true });
  }
}

export async function createBilling(
  dataRoot: string,
  resource: string,
  issuer: string,
  jwks: string,
  env: NodeJS.ProcessEnv,
): Promise<BillingHttp> {
  const required = (key: string) => {
    const value = env[key];
    if (!value) throw new Error(`Missing ${key}`);
    return value;
  };
  const mode = required('ARMATURE_BILLING_MODE');
  if (mode !== 'test' && mode !== 'live') throw new Error('Invalid billing mode');
  if (mode === 'test' && env['NODE_ENV'] === 'production')
    throw new Error('Test billing requires an explicitly non-production environment');
  const secret = required('STRIPE_SECRET_KEY');
  if (!secret.startsWith(`sk_${mode}_`) && !secret.startsWith(`rk_${mode}_`))
    throw new Error('Stripe key does not match billing mode');
  const origin = new URL(resource).origin;
  const config: BillingConfig = {
    origin,
    mode,
    monthlyPrice: required('STRIPE_PRICE_MONTHLY'),
    yearlyPrice: required('STRIPE_PRICE_YEARLY'),
    portalConfiguration: required('STRIPE_PORTAL_CONFIGURATION'),
    webhookSecret: required('STRIPE_WEBHOOK_SECRET'),
  };
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Billing OAuth discovery unavailable');
  const metadata = z
    .object({
      issuer: z.literal(issuer),
      authorization_endpoint: z.string().url(),
      token_endpoint: z.string().url(),
      jwks_uri: z.literal(jwks),
      authorization_response_iss_parameter_supported: z.literal(true),
      code_challenge_methods_supported: z
        .array(z.string())
        .refine((methods) => methods.includes('S256')),
    })
    .parse(await response.json());
  for (const endpoint of [metadata.authorization_endpoint, metadata.token_endpoint]) {
    const url = new URL(endpoint);
    if (
      url.protocol !== 'https:' ||
      url.origin !== new URL(issuer).origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('Untrusted billing OAuth endpoint');
  }
  const store = new BillingStore(join(dataRoot, '.armature-billing.sqlite'));
  try {
    const service = new BillingService(
      store,
      new Stripe(secret, { timeout: 8000, maxNetworkRetries: 1 }),
      config,
    );
    await service.validatePrices();
    store.bindConfiguration(
      JSON.stringify({
        mode,
        origin,
        monthlyPrice: config.monthlyPrice,
        yearlyPrice: config.yearlyPrice,
      }),
    );
    return new BillingController(service, {
      issuer,
      jwks,
      authorization: metadata.authorization_endpoint,
      token: metadata.token_endpoint,
      clientId: required('ARMATURE_BILLING_CLIENT_ID'),
      resource,
    });
  } catch (error) {
    store.close();
    throw error;
  }
}
