# Armature subscriptions

Requested pricing: a **3-day trial**, followed by **$30 USD per month** or **$360 USD
per year**. The annual amount is twelve monthly payments; no discount was specified.
Payment details are required at checkout. The trial starts when Stripe creates the
subscription, not when the user first views the page. Returning subscribers do not
receive another trial on the same Armature account.

## Implementation and scope

The hosted MCP service serves `/billing`, with account sign-in, plan selection and
Stripe Checkout. The authenticated account page opens Stripe's customer portal for
invoices, payment-method updates and cancellation at the end of the trial or paid
period. Checkout clearly displays the recurring amount and the trial terms.
Existing subscriptions must be managed through the portal; a second subscription
cannot be created through this application. Changing monthly/yearly on an existing
subscription is deliberately disabled until a proration policy is defined.

Billing enforcement currently covers the **hosted MCP authoring service**. The
desktop editor and local stdio distribution have no account activation or license
verification integration. This change does not make those offline applications
subscription-enforced. Desktop account activation, entitlement refresh and an
explicit offline-access policy remain separate product work before marketing a
subscription-enforced desktop edition.

There are no real Stripe keys, products, prices or webhook secrets in this repository.
The setup utility creates merchant configuration only; it does not subscribe a
customer, charge a card or enable the running service.

## Security model

- The browser submits only `monthly` or `yearly`. Server-owned price IDs must match
  the approved amount, currency, interval and Stripe mode at startup. Customer IDs,
  quantities, return URLs, price IDs and trial duration cannot be supplied by a client.
- Account ownership derives from the verified OIDC issuer and subject, using the same
  hash as MCP tenant ownership. Email addresses and client-supplied metadata do not
  establish ownership. Human billing uses a separate public OAuth client with exact
  callback, PKCE S256, state, nonce and issuer checks. Both ID and access tokens are
  verified; access-token audience and `armature:edit` scope must match MCP.
- OAuth tokens never reach browser storage. The account session is an opaque,
  30-minute `__Host-` cookie with Secure, HttpOnly and SameSite=Lax. Only its hash is
  stored. All billing mutations require an exact same origin and per-session CSRF
  token. The page uses a restrictive CSP, no third-party scripts and no inline script.
- A private SQLite database at `/data/.armature-billing.sqlite` records ownership,
  trial use, pending checkout, webhook receipts and short-lived sessions. It uses
  WAL, full synchronization, prepared statements and a 0600 database file inside the
  existing 0700 volume. Card details remain with Stripe. The identity database and
  its credentials are not exposed to the billing service.
- Customer creation and checkout persist idempotency keys before calling Stripe.
  Only one billing operation per account runs at a time. A retried request reuses an
  open checkout; selecting another plan expires the earlier open checkout first.
  An unresolved request older than 23 hours requires operator reconciliation, rather
  than risking a duplicate after Stripe's idempotency retention window.
- The signed raw webhook body is verified with a five-minute timestamp tolerance.
  Duplicate events are idempotent. Subscription state is fetched from Stripe so an
  older event cannot restore canceled access. Failed reconciliation returns an error
  so Stripe can retry; the receipt is recorded only after success. Unknown customers
  are ignored and cannot attach themselves to another account.
- Entitlement requires an unexpired trial, or a single recognized active subscription
  with a paid latest invoice. Paused, delinquent, unpaid, canceled, incomplete,
  conflicting and expired states deny authoring access. Current status is cached for
  at most 60 seconds, never past the access deadline; signed events refresh it sooner.
  A Stripe failure with stale state fails closed.
- MCP still authenticates every request. Initialization and tool discovery remain
  available to signed-in users. Without entitlement, `document.open`, `document.save`,
  `document.export`, `document.getSnapshot`, `document.validate` and `document.close`
  remain available for project recovery. Other tools return HTTP 402 with the billing
  URL. Storage is not deleted on cancellation. The existing tenant, path, session and
  process-privilege safeguards remain active.
- Anonymous login has a global 60/minute budget, account checkout/portal actions have
  a shared 10/minute budget, and outstanding login/account records are bounded. Proxy
  IP headers are not trusted as user identities. These are application-level bounds,
  not a substitute for infrastructure traffic limits and storage quotas.

The current deployment is **one process and one replica**. Do not add replicas or
share this database across processes: checkout locking and editing sessions rely on
that constraint. Billing data is bound to its mode, origin and price configuration.
Use a separate volume for Stripe sandbox testing. Once billing state exists, losing
the billing environment stops startup; it does not silently reopen free authoring.

## Account and Stripe provisioning

1. Connect the merchant's Stripe account and verify its account ID and mode. For a
   CLI workflow, supply secrets through a private environment/secret manager, not
   chat, command arguments, repository files or printed command output. Use a
   sandbox first. Live provisioning also verifies merchant activation.
2. Build from repository root:

   ```sh
   pnpm exec turbo run build --filter=@marionette/mcp-server...
   ```

3. With the following values securely supplied to the process, run:

   ```sh
   node packages/mcp-server/dist/billing-setup.js
   ```

   | Setup variable | Meaning |
   |---|---|
   | `STRIPE_SECRET_KEY` | Provisioning API credential for the chosen account and mode |
   | `STRIPE_ACCOUNT_ID` | Verified expected `acct_...` merchant ID |
   | `ARMATURE_BILLING_MODE` | Explicit `test` or `live` |
   | `ARMATURE_BILLING_ORIGIN` | Exact HTTPS service origin, without a trailing slash |
   | `ARMATURE_BILLING_SETUP_OUTPUT` | New private JSON file outside the checkout |
   | `STRIPE_WEBHOOK_SECRET` | Existing signing secret, required when reusing an endpoint |

   The utility verifies the account before mutation, reuses versioned Armature
   products/prices/portal configuration and creates a webhook with Stripe SDK's pinned
   API version. It refuses configuration drift and does not silently rotate secrets.
   Output is created exclusively with mode 0600 and excludes the API key. It contains
   the webhook secret and must be treated as a secret. A failed run may leave an empty
   output file; use a new output path on retry. If a webhook was created but its secret
   was lost before output was saved, recover/rotate it deliberately in Stripe and
   update the server secret; do not create duplicate endpoints.

4. In the auth service, set `ARMATURE_BILLING_CLIENT_JSON` to the exact contents of
   `deploy/auth/billing-client.json` and use the updated `railway-start.sh` body.
   Preserve `ARMATURE_OPENAI_CLIENT_JSON`, the existing realm, users and secrets.
   The script adds each client with `SKIP`, verifies its actual settings and logs a
   bounded success message. Look for `Armature OAuth verified: armature-billing`.
   A successful auth health check does not establish that the background import passed.
   The checked-in callback is:

   `https://armature-mcp-production.up.railway.app/billing/callback`

   For a separate sandbox hostname, change only its billing client callback and
   verification expectation to that exact sandbox URL. Never add wildcard callbacks.

5. Configure the MCP service, retaining its existing volume, UID/GID drop, TLS host,
   issuer, JWKS URL and resource audience:

   | Runtime variable | Value |
   |---|---|
   | `ARMATURE_BILLING_MODE` | `test` in a separate non-production sandbox, `live` for launch |
   | `ARMATURE_BILLING_CLIENT_ID` | `armature-billing` |
   | `STRIPE_SECRET_KEY` | Dedicated runtime key, matching the configured mode |
   | `STRIPE_PRICE_MONTHLY` | Approved $30/month price ID |
   | `STRIPE_PRICE_YEARLY` | Approved $360/year price ID |
   | `STRIPE_PORTAL_CONFIGURATION` | Verified Armature portal configuration ID |
   | `STRIPE_WEBHOOK_SECRET` | Signing secret for this deployment's endpoint |

   Use a restricted runtime key allowing only required customer creation, Checkout
   creation/retrieval/expiration, portal session creation, and reads of prices,
   subscriptions/invoices and portal configuration. Provisioning permissions for
   products, prices, portal configuration and webhooks belong to the setup credential,
   not the runtime key. Verify the restricted key against the sandbox lifecycle before
   replacing a runtime credential.

## Launch verification and operations

- Exercise real human sign-in with two separate accounts. The existing Keycloak realm
  keeps public registration disabled; provision deliberate pilot accounts and verify
  onboarding, email and account recovery before opening registration. A service client
  token is not a substitute for user sign-in.
- In a separate Stripe sandbox, complete monthly and yearly Checkout, then use Stripe
  test clocks to cover trial end, first successful payment, authentication-required or
  failed payment, retry, renewal, portal cancellation, and resubscription without a
  second trial. Verify the actual first charge dates and amounts in Stripe. Send real
  webhook deliveries and retry them, then verify MCP access under each state.
- Configure Stripe's customer emails for trial/renewal reminders, receipts and failed
  payments, including the immediate timing for this short trial. Publish the actual
  merchant's support, privacy, cancellation and terms information in the billing
  profile. Tax collection is not automatically enabled by this implementation;
  configure and verify the merchant's intended tax treatment before launch.
- Test restart and backup/restore of the billing database **with the WAL handled
  consistently**, along with the existing project and identity data. Use SQLite's
  online backup facility or a stopped-service snapshot, not a copy of the main file
  alone during writes. A persistent Railway volume is not itself a backup.
- Alert on Stripe webhook failure rate, billing 5xx responses, database/volume capacity,
  and reconciliation-required/conflict states. Do not log bearer tokens, cookies,
  signing secrets, card data or full Stripe error payloads.
- To resolve a checkout older than 23 hours, first inspect the exact Stripe customer
  and pending idempotency/session record. Reconcile any subscription and expire any
  open checkout before clearing the pending attempt in a backed-up maintenance window.
  Never reset `trialUsed` as a workaround. Deleted Stripe customers and conflicting
  subscriptions also require account-specific reconciliation.
- Do not use `off`, remove the billing database, or roll back to a pre-billing binary
  to handle an outage after subscriptions launch. Those are not safe paid-access
  recovery procedures. Restore the matching configuration/data or temporarily stop
  authoring traffic while keeping billing cancellation available through Stripe.

## Verification record

Local service, HTTP and provisioning tests exercise the real Stripe SDK with a fake
HTTP transport and cryptographically signed OAuth/webhook fixtures. They verify
request fields and failure behavior, not a connected Stripe account or real payments.
Actual local results on 2026-09-14: **157 tests passed in 8 files**, including 47 new
billing tests and all 110 existing MCP tests. TypeScript compilation, all eight
dependency builds (seven cached), targeted lint, package/dash guards, stdio workflow
smoke and portable archive smoke passed. Local Node is 24.19.0, below the repository's
24.20.0 pin; CI uses the pinned toolchain. The cloud browser rejected the local preview
URL with `ERR_BLOCKED_BY_CLIENT`; no visual or real Stripe Checkout pass is claimed.
CI links are recorded in the implementation pull request; do not reuse the earlier
hosted-MCP release results as evidence for this billing change.

Primary references: [Stripe Checkout trials](https://docs.stripe.com/payments/checkout/free-trials),
[subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks),
[webhook signatures and delivery](https://docs.stripe.com/webhooks),
and [Stripe customer portal](https://docs.stripe.com/customer-management).
