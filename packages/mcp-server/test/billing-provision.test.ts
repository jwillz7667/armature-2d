import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { billingEvents, provisionStripe } from '../src/billing/provision';

const options = {
  accountId: 'acct_armature',
  origin: 'https://armature.example.test',
  mode: 'test' as const,
};
function fixture() {
  const calls: { path: string; method: string; body: URLSearchParams; key: string | null }[] = [];
  const products = new Map<string, Record<string, unknown>>();
  const prices = new Map<string, Record<string, unknown>>();
  const portals: Record<string, unknown>[] = [];
  const webhooks: Record<string, unknown>[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const list = (data: unknown[]) => ({ object: 'list', data, has_more: false });
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== 'https://api.stripe.com') throw new Error('Wrong destination');
    const method = init?.method ?? 'GET';
    const body = new URLSearchParams(String(init?.body ?? ''));
    calls.push({
      path: url.pathname,
      method,
      body,
      key: new Headers(init?.headers).get('idempotency-key'),
    });
    const metadata = Object.fromEntries(
      [...body]
        .filter(([key]) => key.startsWith('metadata['))
        .map(([key, value]) => [key.slice(9, -1), value]),
    );
    if (url.pathname === '/v1/account')
      return json({
        id: options.accountId,
        object: 'account',
        charges_enabled: false,
        details_submitted: false,
      });
    if (url.pathname.startsWith('/v1/products/'))
      return products.has('armature_subscription_v1')
        ? json(products.get('armature_subscription_v1'))
        : json(
            {
              error: {
                type: 'invalid_request_error',
                code: 'resource_missing',
                message: 'Missing product',
              },
            },
            404,
          );
    if (url.pathname === '/v1/products') {
      const item = {
        id: body.get('id'),
        object: 'product',
        active: true,
        livemode: false,
        metadata,
      };
      products.set(String(item.id), item);
      return json(item);
    }
    if (url.pathname === '/v1/prices') {
      if (method === 'GET')
        return json(
          list(
            [...prices.values()].filter(
              (price) => price.lookup_key === url.searchParams.get('lookup_keys[0]'),
            ),
          ),
        );
      const item = {
        id: `price_${prices.size}`,
        object: 'price',
        type: 'recurring',
        active: true,
        livemode: false,
        product: body.get('product'),
        unit_amount: Number(body.get('unit_amount')),
        currency: body.get('currency'),
        billing_scheme: 'per_unit',
        lookup_key: body.get('lookup_key'),
        recurring: {
          interval: body.get('recurring[interval]'),
          interval_count: Number(body.get('recurring[interval_count]')),
          usage_type: body.get('recurring[usage_type]'),
          trial_period_days: null,
        },
      };
      prices.set(item.id, item);
      return json(item);
    }
    if (url.pathname.startsWith('/v1/prices/'))
      return json(prices.get(url.pathname.split('/').at(-1)!));
    if (url.pathname === '/v1/billing_portal/configurations') {
      if (method === 'GET') return json(list(portals));
      const item = {
        id: 'bpc_armature',
        object: 'billing_portal.configuration',
        livemode: false,
        active: true,
        metadata,
        features: {
          subscription_cancel: {
            enabled: body.get('features[subscription_cancel][enabled]') === 'true',
            mode: body.get('features[subscription_cancel][mode]'),
          },
          payment_method_update: { enabled: true },
          invoice_history: { enabled: true },
          subscription_update: { enabled: false },
        },
      };
      portals.push(item);
      return json(item);
    }
    if (url.pathname.startsWith('/v1/billing_portal/configurations/')) return json(portals[0]);
    if (url.pathname === '/v1/webhook_endpoints') {
      if (method === 'GET') return json(list(webhooks));
      const item = {
        id: 'we_armature',
        object: 'webhook_endpoint',
        status: 'enabled',
        livemode: false,
        api_version: body.get('api_version'),
        url: body.get('url'),
        metadata,
        enabled_events: [...body]
          .filter(([key]) => key.startsWith('enabled_events['))
          .map(([, value]) => value),
      };
      webhooks.push(item);
      return json({ ...item, secret: 'whsec_test_fixture' });
    }
    throw new Error(`Unhandled operation: ${url.pathname}`);
  };
  return {
    stripe: new Stripe('sk_test_fixture', {
      httpClient: Stripe.createFetchHttpClient(fetch),
      maxNetworkRetries: 0,
    }),
    calls,
    prices,
    webhooks,
  };
}

describe('Stripe account provisioning', () => {
  it('creates the exact recurring plans, cancellable portal and versioned webhook without charging anyone', async () => {
    const f = fixture();
    const result = await provisionStripe(f.stripe, options);
    expect(result).toMatchObject({
      accountId: options.accountId,
      config: {
        monthlyPrice: 'price_0',
        yearlyPrice: 'price_1',
        webhookSecret: 'whsec_test_fixture',
      },
    });
    expect(f.prices.get('price_0')).toMatchObject({
      unit_amount: 3000,
      recurring: { interval: 'month', interval_count: 1, trial_period_days: null },
    });
    expect(f.prices.get('price_1')).toMatchObject({
      unit_amount: 36000,
      recurring: { interval: 'year', interval_count: 1 },
    });
    expect(f.webhooks[0]).toMatchObject({
      enabled_events: billingEvents,
      api_version: Stripe.API_VERSION,
      url: `${options.origin}/billing/webhook`,
    });
    const mutations = f.calls.filter((call) => call.method === 'POST');
    expect(mutations).toHaveLength(5);
    expect(mutations.every((call) => call.key?.startsWith('armature-'))).toBe(true);
    const portal = mutations.find((call) => call.path === '/v1/billing_portal/configurations')!;
    expect(portal.body.get('features[subscription_cancel][mode]')).toBe('at_period_end');
    expect(portal.body.get('login_page[enabled]')).toBe('false');
    expect(f.calls.some((call) => /checkout|subscriptions|payment_intents/.test(call.path))).toBe(
      false,
    );
  });
  it('reuses existing resources and the supplied signing secret on subsequent runs', async () => {
    const f = fixture();
    await provisionStripe(f.stripe, options);
    f.calls.length = 0;
    const result = await provisionStripe(f.stripe, {
      ...options,
      webhookSecret: 'whsec_test_fixture',
    });
    expect(result.webhookId).toBe('we_armature');
    expect(f.calls.some((call) => call.method === 'POST')).toBe(false);
  });
  it('refuses an unverified account or inactive live merchant before changing the catalog', async () => {
    const f = fixture();
    await expect(
      provisionStripe(f.stripe, { ...options, accountId: 'acct_other' }),
    ).rejects.toThrow('does not match');
    await expect(provisionStripe(f.stripe, { ...options, mode: 'live' })).rejects.toThrow(
      'activation is incomplete',
    );
    expect(f.calls.some((call) => call.method === 'POST')).toBe(false);
  });
  it('does not overwrite an unexpected existing price or create another webhook', async () => {
    const f = fixture();
    await provisionStripe(f.stripe, options);
    f.calls.length = 0;
    f.prices.get('price_0')!.unit_amount = 1;
    await expect(
      provisionStripe(f.stripe, { ...options, webhookSecret: 'whsec_test_fixture' }),
    ).rejects.toThrow('approved Armature plans');
    expect(f.calls.some((call) => call.method === 'POST')).toBe(false);
  });
  it('requires the existing secret instead of silently rotating a webhook', async () => {
    const f = fixture();
    await provisionStripe(f.stripe, options);
    f.calls.length = 0;
    await expect(provisionStripe(f.stripe, options)).rejects.toThrow('must be supplied securely');
    expect(f.webhooks).toHaveLength(1);
    expect(f.calls.some((call) => call.method === 'POST')).toBe(false);
  });
});
