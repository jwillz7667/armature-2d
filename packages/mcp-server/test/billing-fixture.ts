import Stripe from 'stripe';
import { BillingStore, type Account } from '../src/billing/store';
import { BillingService, type BillingConfig } from '../src/billing/service';

export const config: BillingConfig = {
  origin: 'https://armature.example.test',
  mode: 'test',
  monthlyPrice: 'price_monthly',
  yearlyPrice: 'price_yearly',
  portalConfiguration: 'bpc_armature',
  webhookSecret: 'whsec_billing_test_fixture',
};
export function subscription(
  status = 'trialing',
  price = config.monthlyPrice,
  now = Math.floor(Date.now() / 1000),
) {
  return {
    id: 'sub_fixture',
    object: 'subscription',
    customer: 'cus_alice',
    livemode: false,
    status,
    trial_end: now + 3 * 86400,
    cancel_at: null,
    cancel_at_period_end: false,
    pause_collection: null,
    latest_invoice: { id: 'in_fixture', object: 'invoice', status: 'paid' },
    items: {
      data: [
        {
          id: 'si_fixture',
          price: { id: price },
          quantity: 1,
          current_period_end: now + 30 * 86400,
        },
      ],
      has_more: false,
    },
  };
}
export function billingFixture(path = ':memory:') {
  const store = new BillingStore(path);
  let clock = Math.floor(Date.now() / 1000);
  const now = () => clock;
  const calls: { path: string; method: string; body: URLSearchParams; key: string | null }[] = [];
  const histories = new Map<string, ReturnType<typeof subscription>[]>();
  const sessions = new Map<
    string,
    {
      id: string;
      object: string;
      customer: string;
      status: string;
      url: string;
      subscription: string | null;
    }
  >();
  const responses = new Map<string, unknown>();
  let failSubscriptions = false,
    failCheckoutResponse = false;
  let monthlyAmount = 3000,
    monthlyLive = false;
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== 'https://api.stripe.com') throw new Error('Unexpected destination');
    const method = init?.method ?? 'GET';
    const body = new URLSearchParams(String(init?.body ?? ''));
    const key = new Headers(init?.headers).get('Idempotency-Key');
    calls.push({ path: url.pathname, method, body, key });
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json', 'Request-Id': 'req_fixture' },
      });
    if (key && responses.has(key)) return json(responses.get(key));
    let value: unknown;
    if (url.pathname.startsWith('/v1/prices/')) {
      const yearly = url.pathname.endsWith('price_yearly');
      value = {
        id: yearly ? 'price_yearly' : 'price_monthly',
        object: 'price',
        active: true,
        currency: 'usd',
        unit_amount: yearly ? 36000 : monthlyAmount,
        type: 'recurring',
        billing_scheme: 'per_unit',
        product: 'prod_armature',
        livemode: yearly ? false : monthlyLive,
        recurring: {
          interval: yearly ? 'year' : 'month',
          interval_count: 1,
          usage_type: 'licensed',
          trial_period_days: null,
        },
      };
    } else if (url.pathname === '/v1/billing_portal/configurations/bpc_armature') {
      value = {
        id: 'bpc_armature',
        object: 'billing_portal.configuration',
        active: true,
        livemode: false,
        features: {
          subscription_cancel: { enabled: true, mode: 'at_period_end' },
          payment_method_update: { enabled: true },
          invoice_history: { enabled: true },
          subscription_update: { enabled: false },
        },
      };
    } else if (url.pathname === '/v1/customers' && method === 'POST') {
      value = {
        id: `cus_${body.get('metadata[armature_owner]')}`,
        object: 'customer',
        livemode: false,
      };
    } else if (url.pathname === '/v1/subscriptions') {
      if (failSubscriptions)
        return json({ error: { type: 'api_error', message: 'Upstream unavailable' } }, 500);
      value = {
        object: 'list',
        data: histories.get(url.searchParams.get('customer')!) ?? [],
        has_more: false,
      };
    } else if (url.pathname.startsWith('/v1/subscriptions/')) {
      value = [...histories.values()]
        .flat()
        .find((sub) => sub.id === url.pathname.split('/').at(-1));
    } else if (url.pathname === '/v1/checkout/sessions' && method === 'POST') {
      const id = `cs_test_${sessions.size + 1}`;
      value = {
        id,
        object: 'checkout.session',
        customer: body.get('customer')!,
        status: 'open',
        url: `https://checkout.stripe.com/c/pay/${id}`,
        subscription: null,
      };
      sessions.set(id, value as NonNullable<ReturnType<typeof sessions.get>>);
      if (key) responses.set(key, value);
      if (failCheckoutResponse) {
        failCheckoutResponse = false;
        throw new Error('Connection lost after Stripe accepted checkout');
      }
    } else if (url.pathname.startsWith('/v1/checkout/sessions/')) {
      const parts = url.pathname.split('/');
      const session = sessions.get(parts[4]!);
      if (!session)
        return json({ error: { type: 'invalid_request_error', message: 'Missing session' } }, 404);
      if (parts[5] === 'expire') session.status = 'expired';
      value = session;
    } else if (url.pathname === '/v1/billing_portal/sessions') {
      value = {
        id: 'bps_fixture',
        object: 'billing_portal.session',
        url: 'https://billing.stripe.com/p/session/fixture',
      };
    } else throw new Error(`Unexpected Stripe operation: ${method} ${url.pathname}`);
    if (key) responses.set(key, value);
    return json(value);
  };
  const stripe = new Stripe('sk_test_fixture', {
    httpClient: Stripe.createFetchHttpClient(fakeFetch),
    maxNetworkRetries: 0,
  });
  const service = new BillingService(store, stripe, config, now);
  function seed(owner = 'alice'): Account {
    const account: Account = {
      owner,
      customer: `cus_${owner}`,
      created: now(),
      trialUsed: false,
      checkout: null,
      status: 'none',
      plan: null,
      accessUntil: 0,
      synced: 0,
      hasSubscription: false,
      cancelAtPeriodEnd: false,
    };
    store.save(account);
    return account;
  }
  function event(
    type = 'customer.subscription.updated',
    id = 'evt_fixture',
    customer = 'cus_alice',
    livemode = false,
    timestamp = Math.floor(Date.now() / 1000),
  ) {
    const body = Buffer.from(
      JSON.stringify({
        id,
        object: 'event',
        type,
        livemode,
        created: timestamp,
        data: {
          object: { id: 'sub_old_event', object: 'subscription', status: 'active', customer },
        },
      }),
    );
    return {
      body,
      signature: stripe.webhooks.generateTestHeaderString({
        payload: body.toString(),
        secret: config.webhookSecret,
        timestamp,
      }),
    };
  }
  return {
    store,
    stripe,
    service,
    calls,
    histories,
    sessions,
    seed,
    event,
    now,
    advance: (seconds: number) => {
      clock += seconds;
    },
    failSubscriptions: (value = true) => {
      failSubscriptions = value;
    },
    failCheckoutResponse: () => {
      failCheckoutResponse = true;
    },
    wrongAmount: () => {
      monthlyAmount = 1;
    },
    wrongMode: () => {
      monthlyLive = true;
    },
  };
}
