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
