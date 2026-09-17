# Railway Keycloak integration

Image: `quay.io/keycloak/keycloak:26.7.3`. Keep the existing PostgreSQL references,
hostname, proxy settings, health check, heap bounds and bootstrap credentials.

Set `ARMATURE_OPENAI_CLIENT_JSON` to the exact contents of `openai-client.json` and
use `railway-start.sh` as the Bash start-command body. This script is also suitable
for a custom image that copies it into the container. The checked-in file and JSON
contain no credentials; `ARMATURE_REALM_JSON` and `KC_BOOTSTRAP_ADMIN_*` already exist
only in the service environment. Do not copy their values into this repository.

For subscription accounts, also set `ARMATURE_BILLING_CLIENT_JSON` from
`billing-client.json`. The updated script imports and verifies both public clients
independently. The billing callback is exact and separate from the OpenAI callback.
See [subscription deployment](../../docs/dev/stripe-subscriptions.md) for Stripe
configuration, lifecycle verification and launch requirements.

The script starts a bounded, background configuration task and then replaces PID 1
with Keycloak. The task authenticates locally, imports the configured public clients
with `ifResourceExists=SKIP`, verifies the resulting settings, and removes its private
temporary token/config files. It never replaces the realm or changes users. A failed
configuration task logs failure while the existing auth service continues to run;
a successful health check alone therefore does not prove the client is configured.
Check for the explicit `Armature OAuth verified` log before beginning the tool scan.

## Account email

`ARMATURE_EMAIL_MODE` defaults to `off`. In `prepared` mode the bootstrap stores and
verifies Resend SMTP settings but leaves email verification, password recovery and
registration settings unchanged. In `enabled` mode it also requires verified email
and enables password recovery. Both modes preserve the separate public-registration
gate, users, client settings and password policy.

Set `ARMATURE_RESEND_API_KEY` only in the auth service's encrypted environment. Use a
`sending_access` key scoped to `auth.viral-ventures-llc.com`. The sender is
`Armature 2D <no-reply@auth.viral-ventures-llc.com>` with SMTP on port 465 and implicit
TLS. The script validates the key alphabet before building JSON, passes the update
through a mode-0600 temporary file, removes it, and keeps credentials out of process
arguments and logs. The running Keycloak process does not inherit the extra Resend
environment variable; its realm configuration necessarily retains the SMTP secret.

Read-back verification proves stored SMTP configuration, not delivery. Do not set
`enabled` until domain verification and an authorized delivery test pass. Public
registration stays closed until the other hosted-launch requirements pass. See
[account email setup](../../docs/dev/account-email.md) for exact DNS records and
the remaining verification steps. Run `node --test tools/test-auth-startup.mjs` for
the bootstrap's local integration tests; CI runs the same checks.

The callback is the exact one shown for the existing OpenAI Platform draft, which
uses issuer identification in the authorization response. Do not add wildcard
redirects. A future portal draft or another OAuth client may require a distinct,
explicit callback registration. This client does not enable arbitrary Codex CLI
loopback callbacks or dynamic client registration.

Keep public account registration disabled until onboarding, recovery, quotas and
retention are ready. A human account in the `armature` realm must finish the portal's
interactive OAuth connection; the master-realm bootstrap admin and the dedicated
machine test client are not user accounts for the public plugin. Configure verified
email and its OIDC scope before claiming enterprise email-domain restrictions.

References: [Keycloak Admin CLI](https://www.keycloak.org/docs/latest/server_admin/index.html#admin-cli)
and [OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth).
