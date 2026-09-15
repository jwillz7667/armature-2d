import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import Stripe from 'stripe';
import { provisionStripe } from './provision';

async function main() {
  const required = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing ${name}`);
    return value;
  };
  const mode = required('ARMATURE_BILLING_MODE');
  if (mode !== 'test' && mode !== 'live') throw new Error('Choose test or live billing explicitly');
  const key = required('STRIPE_SECRET_KEY');
  if (!key.startsWith(`sk_${mode}_`) && !key.startsWith(`rk_${mode}_`))
    throw new Error('Stripe key mode mismatch');
  const output = resolve(required('ARMATURE_BILLING_SETUP_OUTPUT'));
  const parent = await realpath(dirname(output));
  // Keep the signing secret outside the source checkout; do not print it or an API key.
  const fromCwd = relative(await realpath(process.cwd()), parent);
  if (
    !isAbsolute(fromCwd) &&
    fromCwd !== '..' &&
    !fromCwd.startsWith('../') &&
    !fromCwd.startsWith('..\\')
  )
    throw new Error('Choose an output directory outside the source checkout');
  const file = await open(
    output,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const result = await provisionStripe(
      new Stripe(key, { timeout: 15_000, maxNetworkRetries: 1 }),
      {
        accountId: required('STRIPE_ACCOUNT_ID'),
        origin: required('ARMATURE_BILLING_ORIGIN'),
        mode,
        ...(process.env['STRIPE_WEBHOOK_SECRET']
          ? { webhookSecret: process.env['STRIPE_WEBHOOK_SECRET'] }
          : {}),
      },
    );
    await file.writeFile(
      JSON.stringify(
        {
          accountId: result.accountId,
          webhookId: result.webhookId,
          environment: {
            ARMATURE_BILLING_MODE: mode,
            ARMATURE_BILLING_CLIENT_ID: 'armature-billing',
            STRIPE_PRICE_MONTHLY: result.config.monthlyPrice,
            STRIPE_PRICE_YEARLY: result.config.yearlyPrice,
            STRIPE_PORTAL_CONFIGURATION: result.config.portalConfiguration,
            STRIPE_WEBHOOK_SECRET: result.config.webhookSecret,
          },
        },
        null,
        2,
      ) + '\n',
    );
    await file.sync();
    console.log(
      'Stripe plans, portal and webhook configured. Private deployment settings saved; billing is not enabled by this command.',
    );
  } finally {
    await file.close();
  }
}
void main().catch((error) => {
  // Stripe errors can include request data. Output only our own bounded setup messages.
  console.error(
    error instanceof Stripe.errors.StripeError
      ? 'Stripe setup failed. Check account access and Stripe request logs.'
      : error instanceof Error
        ? error.message
        : 'Stripe setup failed.',
  );
  process.exitCode = 1;
});
