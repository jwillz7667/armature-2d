import { createHash } from 'node:crypto';
import Stripe from 'stripe';
import { BillingService, type BillingConfig } from './service';
import { BillingStore } from './store';

export const billingEvents: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  'checkout.session.completed',
  'checkout.session.expired',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.trial_will_end',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'customer.deleted',
];

// Operator-only setup. Never exposed through HTTP or MCP, and never creates a subscription/charge.
export async function provisionStripe(
  stripe: Stripe,
  options: { accountId: string; origin: string; mode: 'test' | 'live'; webhookSecret?: string },
) {
  const url = new URL(options.origin);
  if (url.protocol !== 'https:' || url.origin !== options.origin)
    throw new Error('Billing origin must be an exact HTTPS origin');
  if (!/^acct_[A-Za-z0-9]+$/.test(options.accountId))
    throw new Error('Expected Stripe account ID is required');
  const account = await stripe.accounts.retrieveCurrent();
  if (account.id !== options.accountId)
    throw new Error('Stripe account does not match the requested account');
  if (options.mode === 'live' && (!account.charges_enabled || !account.details_submitted))
    throw new Error('Stripe merchant activation is incomplete');
  const live = options.mode === 'live';
  const productId = 'armature_subscription_v1';
  let product: Stripe.Product;
  try {
    product = await stripe.products.retrieve(productId);
  } catch (error) {
    if (
      !(error instanceof Stripe.errors.StripeInvalidRequestError) ||
      error.code !== 'resource_missing'
    )
      throw error;
    product = await stripe.products.create(
      {
        id: productId,
        name: 'Armature',
        description: 'Armature subscription with monthly or yearly billing.',
        metadata: { application: 'armature', billing_version: '1' },
      },
      { idempotencyKey: 'armature-product-v1' },
    );
  }
  if (!product.active || product.livemode !== live || product.metadata.application !== 'armature')
    throw new Error('Existing Armature product has unexpected settings');
  const prices: string[] = [];
  for (const [plan, amount, interval] of [
    ['monthly', 3000, 'month'],
    ['yearly', 36000, 'year'],
  ] as const) {
    const lookup = `armature_usd_${plan}_v1`;
    const existing = await stripe.prices.list({ lookup_keys: [lookup], limit: 2 });
    if (existing.has_more || existing.data.length > 1)
      throw new Error('Duplicate Armature price lookup key');
    const price =
      existing.data[0] ??
      (await stripe.prices.create(
        {
          product: product.id,
          currency: 'usd',
          unit_amount: amount,
          recurring: { interval, interval_count: 1, usage_type: 'licensed' },
          lookup_key: lookup,
          metadata: { application: 'armature', billing_version: '1' },
        },
        { idempotencyKey: `armature-price-${lookup}` },
      ));
    if (price.product !== product.id) throw new Error('Armature price belongs to another product');
    prices.push(price.id);
  }
  const siteKey = createHash('sha256').update(options.origin).digest('hex').slice(0, 24);
  const configurations = await stripe.billingPortal.configurations
    .list({ limit: 100 })
    .autoPagingToArray({ limit: 1000 });
  const matching = configurations.filter(
    (item) =>
      item.metadata?.application === 'armature' &&
      item.metadata?.site === siteKey &&
      item.metadata?.billing_version === '1',
  );
  if (matching.length > 1)
    throw new Error('Multiple Armature portal configurations require reconciliation');
  const portal =
    matching[0] ??
    (await stripe.billingPortal.configurations.create(
      {
        name: 'Armature subscriptions',
        default_return_url: `${options.origin}/billing`,
        login_page: { enabled: false },
        features: {
          payment_method_update: { enabled: true },
          invoice_history: { enabled: true },
          subscription_cancel: { enabled: true, mode: 'at_period_end' },
          subscription_update: { enabled: false },
        },
        metadata: { application: 'armature', site: siteKey, billing_version: '1' },
      },
      { idempotencyKey: `armature-portal-${siteKey}-v1` },
    ));
  const config: BillingConfig = {
    origin: options.origin,
    mode: options.mode,
    monthlyPrice: prices[0]!,
    yearlyPrice: prices[1]!,
    portalConfiguration: portal.id,
    webhookSecret: '',
  };
  const store = new BillingStore(':memory:');
  try {
    await new BillingService(store, stripe, config).validatePrices();
  } finally {
    store.close();
  }
  const endpoints = await stripe.webhookEndpoints
    .list({ limit: 100 })
    .autoPagingToArray({ limit: 1000 });
  const matches = endpoints.filter(
    (endpoint) => endpoint.url === `${options.origin}/billing/webhook`,
  );
  if (matches.length > 1) throw new Error('Multiple webhook endpoints require reconciliation');
  let endpoint = matches[0];
  let secret = options.webhookSecret;
  if (!endpoint) {
    endpoint = await stripe.webhookEndpoints.create(
      {
        url: `${options.origin}/billing/webhook`,
        enabled_events: billingEvents,
        api_version: Stripe.API_VERSION,
        connect: false,
        description: 'Armature subscription access reconciliation',
        metadata: { application: 'armature', site: siteKey, billing_version: '1' },
      },
      { idempotencyKey: `armature-webhook-${siteKey}-v1` },
    );
    secret = endpoint.secret;
  }
  if (
    endpoint.livemode !== live ||
    endpoint.status !== 'enabled' ||
    endpoint.api_version !== Stripe.API_VERSION ||
    endpoint.metadata.application !== 'armature' ||
    billingEvents.some((event) => !endpoint.enabled_events.includes(event))
  )
    throw new Error('Existing webhook settings require reconciliation');
  if (!secret?.startsWith('whsec_'))
    throw new Error(
      'Existing webhook signing secret must be supplied securely; setup will not rotate it',
    );
  return {
    accountId: account.id,
    webhookId: endpoint.id,
    config: { ...config, webhookSecret: secret },
  };
}
