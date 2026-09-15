# Armature account email setup

Updated: 2026-09-15. Provider: Resend. Sending domain:
`auth.viral-ventures-llc.com`. Sender:
`Armature 2D <no-reply@auth.viral-ventures-llc.com>`.

The domain exists in the connected Resend account with sending enabled, receiving
disabled, open/click tracking disabled, and required TLS for delivery. A new
domain-scoped, sending-only API key is stored only in Railway's `armature-auth`
service environment. It is not committed or copied into the MCP service.

## DNS records to add at Name.com

Public DNS reports Name.com nameservers. The root domain's existing iCloud MX and
SPF records remain untouched. Add these records to the `viral-ventures-llc.com`
zone. Host names below are relative to that zone. Use the provider's automatic or
default TTL. The DKIM value is a public verification key, not a credential.

| Type | Host | Value | Priority |
| --- | --- | --- | --- |
| TXT | `resend._domainkey.auth` | DKIM value below | |
| MX | `send.auth` | `feedback-smtp.us-east-1.amazonses.com` | 10 |
| TXT | `send.auth` | `v=spf1 include:amazonses.com ~all` | |
| CNAME | `rsend.auth` | `send.forge.rmta.net` | |

DKIM TXT value, one continuous string:

```text
p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC4d3tTaGwgg4GcLJ18ThYaFql9up+aG9K3iErwHSpCciIbTwVKZUOJBdXJrsb8DYNHoojTfFj/bra31/uQLct4no2mNVQDkU007S73YSdlsa0JiecY8WnxwuWzZ6lj5DoppkcYFghdcGTQw1yNN/KYn4N67UMEZ75hxkcgkIv+YwIDAQAB
```

The connected Vercel account returned no accessible teams, and this zone is not
hosted at Vercel. No available connected tool can modify this Name.com zone. The
records above are prepared; they have not been installed or verified.

## Activation and acceptance

1. Add the four DNS records and trigger Resend domain verification. Read the domain
   back and require sending verification to succeed.
2. With `ARMATURE_EMAIL_MODE=prepared`, inspect the auth service's explicit email
   configuration verification log. A successful health check alone is insufficient.
3. Test SMTP from the deployed Keycloak service to an authorized test destination.
   Require Resend delivery evidence and confirm the actual verification/reset
   content uses the canonical HTTPS issuer. Provider test sink delivery is useful
   but does not prove that a human can receive and use the links.
4. Set `ARMATURE_EMAIL_MODE=enabled` and redeploy the auth service. Confirm live
   `verifyEmail=true`, `resetPasswordAllowed=true`, TLS SMTP and unchanged public
   registration. Test an actual user account's verification, login, password reset,
   token expiry and PKCE callback. Never use the bootstrap administrator as a
   public plugin account or expose its credential.
5. Enable public registration separately only after retention/deletion, backups and
   restore, abuse controls and the remaining launch gates have been verified. SMTP
   readiness does not enable live Stripe billing or publish the OpenAI listing.

## Actual verification

- Ten local bootstrap integration tests pass using the real startup script and a
  fake Keycloak CLI. They cover off/prepared/enabled modes, unchanged registration,
  both existing public clients, mode-0600 credential files, private-file cleanup,
  credentials absent from arguments/logs, invalid/injected key rejection, and
  update/read/TLS/account-flow drift failures. These are not delivery tests.
- Bash syntax, targeted lint, formatting and the repository dash guard are checked
  with this change. Deployment evidence is recorded after rollout.
- DNS verification, SMTP delivery and human account recovery have not yet passed.

References: [Resend SMTP](https://resend.com/docs/send-with-smtp) and
[Keycloak email configuration](https://www.keycloak.org/docs/latest/server_admin/index.html#_email).
