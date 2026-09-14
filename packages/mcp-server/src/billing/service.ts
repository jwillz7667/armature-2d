import Stripe from 'stripe';
import { BillingStore, randomToken, type Account, type Plan } from './store';

export class BillingError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export interface BillingConfig {
  origin: string;
  mode: 'test' | 'live';
  monthlyPrice: string;
  yearlyPrice: string;
  portalConfiguration: string;
  webhookSecret: string;
}
const terminal = new Set(['canceled', 'incomplete_expired']);
const idOf = (value: string | { id: string } | null) =>
  typeof value === 'string' ? value : value?.id;
export class BillingService {
  private readonly locks = new Set<string>();
  constructor(
    readonly store: BillingStore,
    readonly stripe: Stripe,
    readonly config: BillingConfig,
    readonly now = () => Math.floor(Date.now() / 1000),
  ) {}
  private async locked<T>(owner: string, task: () => Promise<T>): Promise<T> {
    if (this.locks.has(owner) || this.locks.size >= 64)
      throw new BillingError(409, 'BILLING_BUSY', 'Billing is updating. Please retry shortly.');
    this.locks.add(owner);
    try {
      return await task();
    } finally {
      this.locks.delete(owner);
    }
  }
  async validatePrices() {
    const [monthly, yearly] = await Promise.all([
      this.stripe.prices.retrieve(this.config.monthlyPrice),
      this.stripe.prices.retrieve(this.config.yearlyPrice),
    ]);
    for (const [price, amount, interval] of [
      [monthly, 3000, 'month'],
      [yearly, 36000, 'year'],
    ] as const) {
      if (
        !price.active ||
        price.livemode !== (this.config.mode === 'live') ||
        price.currency !== 'usd' ||
        price.unit_amount !== amount ||
        price.type !== 'recurring' ||
        price.billing_scheme !== 'per_unit' ||
        price.recurring?.interval !== interval ||
        price.recurring.interval_count !== 1 ||
        price.recurring.usage_type !== 'licensed' ||
        price.recurring.trial_period_days
      )
        throw new Error('Stripe prices do not match the approved Armature plans');
    }
    if (idOf(monthly.product) !== idOf(yearly.product))
      throw new Error('Stripe plans must use one Armature product');
    const portal = await this.stripe.billingPortal.configurations.retrieve(
      this.config.portalConfiguration,
    );
    if (
      !portal.active ||
      portal.livemode !== (this.config.mode === 'live') ||
      !portal.features.subscription_cancel.enabled ||
      portal.features.subscription_cancel.mode !== 'at_period_end' ||
      !portal.features.payment_method_update.enabled ||
      !portal.features.invoice_history.enabled ||
      portal.features.subscription_update.enabled
    )
      throw new Error(
        'Stripe portal must allow invoices, payment updates and cancellation, with plan changes disabled',
      );
  }
  private initial(owner: string): Account {
    return {
      owner,
      customer: null,
      created: this.now(),
      trialUsed: false,
      checkout: null,
      status: 'none',
      plan: null,
      accessUntil: 0,
      synced: 0,
      hasSubscription: false,
      cancelAtPeriodEnd: false,
    };
  }
  private async customer(account: Account) {
    if (account.customer) return;
    if (this.now() - account.created > 23 * 3600)
      throw new BillingError(
        409,
        'CUSTOMER_RECONCILIATION_REQUIRED',
        'Billing setup needs support before retrying.',
      );
    // Persist before the network request so a restart reuses the same idempotency key.
    this.store.save(account);
    const customer = await this.stripe.customers.create(
      { metadata: { armature_owner: account.owner, application: 'armature' } },
      { idempotencyKey: `armature-customer-${account.owner}` },
    );
    if (customer.livemode !== (this.config.mode === 'live'))
      throw new Error('Stripe customer mode mismatch');
    account.customer = customer.id;
    this.store.save(account);
  }
  private async reconcile(account: Account) {
    if (!account.customer) return account;
    const subscriptions: Stripe.Subscription[] = [];
    let cursor: string | undefined;
    for (let page = 0; ; page++) {
      if (page >= 10) throw new Error('Subscription history exceeds reconciliation budget');
      const result = await this.stripe.subscriptions.list({
        customer: account.customer,
        status: 'all',
        limit: 100,
        expand: ['data.latest_invoice'],
        ...(cursor ? { starting_after: cursor } : {}),
      });
      subscriptions.push(...result.data);
      if (!result.has_more) break;
      cursor = result.data.at(-1)?.id;
      if (!cursor) throw new Error('Invalid Stripe pagination');
    }
    account.trialUsed ||= subscriptions.length > 0;
    const current = subscriptions.filter((sub) => !terminal.has(sub.status));
    account.hasSubscription = current.length > 0;
    account.status =
      current.length > 1
        ? 'conflict'
        : (current[0]?.status ?? (account.trialUsed ? 'canceled' : 'none'));
    account.plan = null;
    account.accessUntil = 0;
    account.cancelAtPeriodEnd = current[0]?.cancel_at_period_end ?? false;
    const subscription = current.length === 1 ? current[0] : undefined;
    if (
      subscription &&
      subscription.livemode === (this.config.mode === 'live') &&
      !subscription.pause_collection &&
      subscription.items.data.length === 1 &&
      !subscription.items.has_more
    ) {
      const item = subscription.items.data[0]!;
      account.plan =
        item.price.id === this.config.monthlyPrice
          ? 'monthly'
          : item.price.id === this.config.yearlyPrice
            ? 'yearly'
            : null;
      if (account.plan && item.quantity === 1) {
        if (subscription.status === 'trialing' && subscription.trial_end)
          account.accessUntil = subscription.trial_end;
        const invoice = subscription.latest_invoice;
        if (
          subscription.status === 'active' &&
          typeof invoice === 'object' &&
          invoice?.status === 'paid'
        )
          account.accessUntil = item.current_period_end;
        if (subscription.cancel_at)
          account.accessUntil = Math.min(account.accessUntil, subscription.cancel_at);
      }
    }
    account.synced = this.now();
    this.store.save(account);
    return account;
  }
  async status(owner: string, force = false) {
    return this.locked(owner, async () => {
      const account = this.store.account(owner) ?? this.initial(owner);
      if (
        account.customer &&
        (force ||
          this.now() - account.synced >= 60 ||
          (account.accessUntil > 0 && account.accessUntil <= this.now()))
      )
        await this.reconcile(account);
      return {
        status: account.status,
        plan: account.plan,
        active: account.accessUntil > this.now(),
        accessUntil: account.accessUntil || null,
        trialEligible: !account.trialUsed,
        cancelAtPeriodEnd: account.cancelAtPeriodEnd,
        canManage: account.customer !== null,
        mode: this.config.mode,
      };
    });
  }
  async entitled(owner: string) {
    return (await this.status(owner)).active;
  }
  async checkout(owner: string, plan: Plan) {
    return this.locked(owner, async () => {
      const account = this.store.account(owner) ?? this.initial(owner);
      await this.customer(account);
      await this.reconcile(account);
      if (account.hasSubscription)
        throw new BillingError(
          409,
          'SUBSCRIPTION_EXISTS',
          'Manage your existing subscription instead of starting another.',
        );
      let attempt = account.checkout;
      if (attempt && this.now() - attempt.started >= 23 * 3600 && !attempt.sessionId)
        throw new BillingError(
          409,
          'CHECKOUT_RECONCILIATION_REQUIRED',
          'Checkout needs support before retrying.',
        );
      if (attempt?.sessionId) {
        const session = await this.stripe.checkout.sessions.retrieve(attempt.sessionId);
        if (session.status === 'complete') {
          const subscriptionId = idOf(session.subscription);
          if (
            !subscriptionId ||
            !terminal.has((await this.stripe.subscriptions.retrieve(subscriptionId)).status)
          )
            throw new BillingError(
              409,
              'CHECKOUT_COMPLETED',
              'Your checkout is complete. Refresh your billing status.',
            );
        }
        if (
          session.status === 'open' &&
          attempt.plan === plan &&
          attempt.trial === !account.trialUsed
        )
          return this.checkoutUrl(session.url);
        if (session.status === 'open') await this.stripe.checkout.sessions.expire(session.id);
        account.checkout = null;
        this.store.save(account);
        attempt = null;
      }
      if (!attempt) {
        attempt = {
          key: randomToken(),
          started: this.now(),
          plan,
          price: plan === 'monthly' ? this.config.monthlyPrice : this.config.yearlyPrice,
          trial: !account.trialUsed,
          sessionId: null,
        };
        account.checkout = attempt;
        this.store.save(account);
      } else if (attempt.plan !== plan) {
        throw new BillingError(
          409,
          'CHECKOUT_PENDING',
          'Retry your original plan to resolve the pending checkout first.',
        );
      }
      const session = await this.stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          customer: account.customer!,
          client_reference_id: owner,
          line_items: [{ price: attempt.price, quantity: 1 }],
          payment_method_types: ['card'],
          payment_method_collection: 'always',
          expires_at: attempt.started + 86400,
          success_url: `${this.config.origin}/billing?checkout=complete`,
          cancel_url: `${this.config.origin}/billing?checkout=canceled`,
          subscription_data: {
            metadata: { armature_owner: owner, application: 'armature' },
            ...(attempt.trial
              ? {
                  trial_period_days: 3,
                  trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } },
                }
              : {}),
          },
          metadata: { armature_owner: owner, application: 'armature' },
          custom_text: {
            submit: {
              message: attempt.trial
                ? `3 days free, then ${attempt.plan === 'monthly' ? '$30 each month' : '$360 each year'}. Cancel before the trial ends to avoid a charge.`
                : `${attempt.plan === 'monthly' ? '$30 each month' : '$360 each year'}. Your account has already used its trial.`,
            },
          },
        },
        { idempotencyKey: `armature-checkout-${attempt.key}` },
      );
      attempt.sessionId = session.id;
      this.store.save(account);
      if (session.status !== 'open')
        throw new BillingError(
          409,
          'CHECKOUT_EXPIRED',
          'The previous checkout expired. Please try again.',
        );
      return this.checkoutUrl(session.url);
    });
  }
  private checkoutUrl(value: string | null) {
    if (!value || new URL(value).origin !== 'https://checkout.stripe.com')
      throw new Error('Unexpected Stripe Checkout URL');
    return value;
  }
  async portal(owner: string) {
    return this.locked(owner, async () => {
      const account = this.store.account(owner);
      if (!account?.customer)
        throw new BillingError(
          409,
          'NO_CUSTOMER',
          'Start a subscription before opening billing management.',
        );
      const session = await this.stripe.billingPortal.sessions.create({
        customer: account.customer,
        configuration: this.config.portalConfiguration,
        return_url: `${this.config.origin}/billing`,
      });
      if (new URL(session.url).origin !== 'https://billing.stripe.com')
        throw new Error('Unexpected Stripe portal URL');
      return session.url;
    });
  }
  async webhook(body: Buffer, signature: string) {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(body, signature, this.config.webhookSecret, 300);
    } catch {
      throw new BillingError(400, 'INVALID_SIGNATURE', 'Invalid webhook signature.');
    }
    if (event.livemode !== (this.config.mode === 'live'))
      throw new BillingError(400, 'MODE_MISMATCH', 'Webhook mode mismatch.');
    if (this.store.eventSeen(event.id)) return;
    const object = event.data.object;
    const customer =
      'customer' in object
        ? idOf(object.customer as string | { id: string } | null)
        : event.type === 'customer.deleted' && 'id' in object
          ? object.id
          : undefined;
    if (!customer) return;
    const owner = this.store.customerOwner(customer);
    if (!owner) return;
    await this.locked(owner, async () => {
      if (this.store.eventSeen(event.id)) return;
      const account = this.store.account(owner)!;
      if (event.type === 'customer.deleted') {
        account.status = 'customer_deleted';
        account.accessUntil = 0;
        account.synced = this.now();
        account.trialUsed = true;
      } else {
        // Retrieve current Stripe state: event delivery order cannot roll back access.
        await this.reconcile(account);
      }
      this.store.finishEvent(event.id, account, this.now());
    });
  }
}
