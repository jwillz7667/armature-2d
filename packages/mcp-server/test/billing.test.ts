import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { BillingService } from '../src/billing/service';
import { BillingStore } from '../src/billing/store';
import { billingFixture, config, subscription } from './billing-fixture';

const fixtures: ReturnType<typeof billingFixture>[] = [];
const make = () => {
  const fixture = billingFixture();
  fixtures.push(fixture);
  return fixture;
};
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.store.close();
});

describe('Stripe subscriptions', () => {
  it('refuses to reuse billing state with different Stripe mode or price configuration', () => {
    const f = make();
    const binding = JSON.stringify({
      mode: 'test',
      origin: config.origin,
      monthlyPrice: config.monthlyPrice,
    });
    f.store.bindConfiguration(binding);
    f.store.bindConfiguration(binding);
    expect(() => f.store.bindConfiguration(JSON.stringify({ mode: 'live' }))).toThrow(
      'different deployment',
    );
  });
  it('validates the exact USD recurring prices and cancellable billing portal', async () => {
    const f = make();
    await f.service.validatePrices();
    f.wrongAmount();
    await expect(f.service.validatePrices()).rejects.toThrow('approved Armature plans');
  });
  it('fails startup validation when Stripe price mode does not match the server', async () => {
    const f = make();
    f.wrongMode();
    await expect(f.service.validatePrices()).rejects.toThrow('approved Armature plans');
  });
  it.each(['monthly', 'yearly'] as const)(
    'uses the approved %s plan with a three-day trial and a required payment method',
    async (plan) => {
      const f = make();
      expect(await f.service.checkout('alice', plan)).toMatch(/^https:\/\/checkout.stripe.com\//);
      const request = f.calls.find(
        (call) => call.path === '/v1/checkout/sessions' && call.method === 'POST',
      )!;
      expect(Object.fromEntries(request.body)).toMatchObject({
        mode: 'subscription',
        customer: 'cus_alice',
        'line_items[0][price]': plan === 'monthly' ? config.monthlyPrice : config.yearlyPrice,
        'line_items[0][quantity]': '1',
        payment_method_collection: 'always',
        'subscription_data[trial_period_days]': '3',
        'subscription_data[trial_settings][end_behavior][missing_payment_method]': 'cancel',
      });
      expect(request.body.get('success_url')).toBe(`${config.origin}/billing?checkout=complete`);
      expect(request.key).toMatch(/^armature-checkout-/);
      expect(request.body.get('integration_identifier')).toMatch(
        /^armature_hosted_subscription_[a-z]{8}$/,
      );
      expect([...request.body.keys()].some((key) => key.startsWith('payment_method_types'))).toBe(
        false,
      );
      expect(request.body.has('allow_promotion_codes')).toBe(false);
    },
  );
  it('rejects concurrent checkout and reuses the open checkout after a retry', async () => {
    const f = make();
    const results = await Promise.allSettled([
      f.service.checkout('alice', 'monthly'),
      f.service.checkout('alice', 'monthly'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'BILLING_BUSY' },
    });
    const again = await f.service.checkout('alice', 'monthly');
    expect(again).toBe('https://checkout.stripe.com/c/pay/cs_test_1');
    expect(f.sessions.size).toBe(1);
  });
  it('recovers an uncertain network response using the same durable idempotency key', async () => {
    const f = make();
    f.failCheckoutResponse();
    await expect(f.service.checkout('alice', 'monthly')).rejects.toThrow();
    f.advance(60);
    const restarted = new BillingService(f.store, f.stripe, config, f.now);
    await restarted.checkout('alice', 'monthly');
    const requests = f.calls.filter(
      (call) => call.path === '/v1/checkout/sessions' && call.method === 'POST',
    );
    expect(requests).toHaveLength(2);
    expect(requests[0]!.key).toBe(requests[1]!.key);
    expect(requests[0]!.body.toString()).toBe(requests[1]!.body.toString());
    expect(f.sessions.size).toBe(1);
  });
  it('expires the previous open checkout before changing plans', async () => {
    const f = make();
    await f.service.checkout('alice', 'monthly');
    await f.service.checkout('alice', 'yearly');
    expect(f.sessions.get('cs_test_1')!.status).toBe('expired');
    expect(f.sessions.size).toBe(2);
  });
  it('blocks a second subscription and grants access only during the real trial', async () => {
    const f = make();
    f.seed();
    f.histories.set('cus_alice', [subscription('trialing', config.monthlyPrice, f.now())]);
    expect(await f.service.entitled('alice')).toBe(true);
    await expect(f.service.checkout('alice', 'yearly')).rejects.toMatchObject({
      code: 'SUBSCRIPTION_EXISTS',
    });
    f.advance(3 * 86400 + 1);
    expect(await f.service.entitled('alice')).toBe(false);
  });
  it('allows resubscription after cancellation without another trial', async () => {
    const f = make();
    await f.service.checkout('alice', 'monthly');
    const session = f.sessions.get('cs_test_1')!;
    session.status = 'complete';
    session.subscription = 'sub_fixture';
    f.histories.set('cus_alice', [subscription('canceled')]);
    await f.service.checkout('alice', 'yearly');
    const request = f.calls
      .filter((call) => call.path === '/v1/checkout/sessions' && call.method === 'POST')
      .at(-1)!;
    expect(request.body.has('subscription_data[trial_period_days]')).toBe(false);
    expect(f.store.account('alice')!.trialUsed).toBe(true);
  });
  it.each(['past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', 'canceled'])(
    'denies access for %s',
    async (status) => {
      const f = make();
      f.seed();
      f.histories.set('cus_alice', [subscription(status)]);
      expect(await f.service.entitled('alice')).toBe(false);
    },
  );
  it('requires a paid invoice, a known plan and one unpaused subscription for active access', async () => {
    const f = make();
    f.seed();
    const sub = subscription('active');
    f.histories.set('cus_alice', [sub]);
    expect((await f.service.status('alice', true)).active).toBe(true);
    sub.latest_invoice.status = 'open';
    expect((await f.service.status('alice', true)).active).toBe(false);
    sub.latest_invoice.status = 'paid';
    sub.items.data[0]!.price.id = 'price_other';
    expect((await f.service.status('alice', true)).active).toBe(false);
    sub.items.data[0]!.price.id = config.monthlyPrice;
    f.histories.set('cus_alice', [sub, { ...sub, id: 'sub_duplicate' }]);
    expect(await f.service.status('alice', true)).toMatchObject({
      active: false,
      status: 'conflict',
    });
  });
  it('retains paid access through scheduled cancellation and stops at the period boundary', async () => {
    const f = make();
    f.seed();
    const sub = subscription('active', config.yearlyPrice, f.now());
    sub.cancel_at_period_end = true;
    f.histories.set('cus_alice', [sub]);
    expect(await f.service.status('alice')).toMatchObject({
      active: true,
      cancelAtPeriodEnd: true,
      plan: 'yearly',
    });
    f.advance(30 * 86400 + 1);
    expect(await f.service.entitled('alice')).toBe(false);
  });
  it('reconciles current Stripe state for signed, duplicated and out-of-order webhooks', async () => {
    const f = make();
    f.seed();
    f.histories.set('cus_alice', [subscription('canceled')]);
    const e = f.event();
    await f.service.webhook(e.body, e.signature);
    expect(f.store.account('alice')!.accessUntil).toBe(0);
    const count = f.calls.length;
    await f.service.webhook(e.body, e.signature);
    expect(f.calls).toHaveLength(count);
    const older = f.event('customer.subscription.created', 'evt_older');
    await f.service.webhook(older.body, older.signature);
    expect(f.store.account('alice')!.status).toBe('canceled');
  });
  it('rejects tampered, expired and wrong-mode webhook signatures', async () => {
    const f = make();
    f.seed();
    const e = f.event();
    await expect(
      f.service.webhook(Buffer.concat([e.body, Buffer.from(' ')]), e.signature),
    ).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
    const stale = f.event(
      'customer.subscription.updated',
      'evt_stale',
      'cus_alice',
      false,
      Math.floor(Date.now() / 1000) - 301,
    );
    await expect(f.service.webhook(stale.body, stale.signature)).rejects.toMatchObject({
      code: 'INVALID_SIGNATURE',
    });
    const live = f.event('customer.subscription.updated', 'evt_live', 'cus_alice', true);
    await expect(f.service.webhook(live.body, live.signature)).rejects.toMatchObject({
      code: 'MODE_MISMATCH',
    });
  });
  it('does not consume failed webhook deliveries and fails closed on stale Stripe status', async () => {
    const f = make();
    f.seed();
    f.histories.set('cus_alice', [subscription('active')]);
    await f.service.status('alice');
    f.advance(61);
    f.failSubscriptions();
    await expect(f.service.entitled('alice')).rejects.toThrow();
    const e = f.event();
    await expect(f.service.webhook(e.body, e.signature)).rejects.toThrow();
    expect(f.store.eventSeen('evt_fixture')).toBe(false);
    f.failSubscriptions(false);
    await f.service.webhook(e.body, e.signature);
    expect(f.store.eventSeen('evt_fixture')).toBe(true);
  });
  it('never maps a signed event for an unrelated customer to an account', async () => {
    const f = make();
    f.seed();
    const e = f.event('customer.subscription.updated', 'evt_other', 'cus_unknown');
    await f.service.webhook(e.body, e.signature);
    expect(f.calls).toHaveLength(0);
    expect(f.store.account('alice')!.trialUsed).toBe(false);
  });
  it('opens the portal for the server-bound customer', async () => {
    const f = make();
    f.seed('alice');
    f.seed('bob');
    await f.service.portal('alice');
    expect(f.calls.at(-1)!.body.get('customer')).toBe('cus_alice');
    expect(f.calls.at(-1)!.body.get('configuration')).toBe(config.portalConfiguration);
  });
  it('persists trial use, event receipts and account ownership across reopening the private database', () => {
    const root = mkdtempSync(join(tmpdir(), 'armature-billing-'));
    const file = join(root, 'billing.sqlite');
    const f = billingFixture(file);
    const account = f.seed();
    account.trialUsed = true;
    f.store.finishEvent('evt_saved', account, f.now());
    f.store.close();
    const reopened = new BillingStore(file);
    try {
      expect(reopened.account('alice')!.trialUsed).toBe(true);
      expect(reopened.customerOwner('cus_alice')).toBe('alice');
      expect(reopened.eventSeen('evt_saved')).toBe(true);
      if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
    } finally {
      reopened.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
