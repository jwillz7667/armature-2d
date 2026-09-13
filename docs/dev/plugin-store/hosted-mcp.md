# Hosted MCP resource server

This implementation is a staging backend, not a deployed service or an approved store
listing. It shares all 208 existing tools and command/history behavior with stdio.
The desktop application and its project format are unchanged.

## Run and deploy

Build with `pnpm exec turbo run build --filter=@marionette/mcp-server...`, then run
`node packages/mcp-server/dist/http.js`. Configure all of:

| Variable | Value |
|---|---|
| ARMATURE_DATA_ROOT | Private persistent directory owned by the service user |
| ARMATURE_PUBLIC_URL | Exact public HTTPS resource URL, ending in /mcp |
| ARMATURE_OAUTH_ISSUER | Exact issuer of an independently configured OAuth provider |
| ARMATURE_OAUTH_JWKS_URL | Trusted HTTPS signing-key endpoint for that issuer |
| PORT | Internal HTTP port, defaults to 8080 |

The public reverse proxy terminates TLS and must preserve the public Host header.
The application does not trust forwarded host headers. Health checks use `/healthz`.
Build the container from repository root with
`docker build -f deploy/mcp/Dockerfile -t armature-mcp .`.
For Railway, select `deploy/mcp/railway.json` as the config file, attach a private
persistent volume at `/data`, and ensure its permissions allow the container's
non-root `node` user (UID 1000) to create directories. Never make that volume public.
The container contains the self-contained server bundle and license, not repository
source or build dependencies. It runs one replica because editing sessions are in memory.

## Authentication and isolation

The backend is an OAuth resource server. It does not create an identity provider,
register OAuth clients, implement login, or mint tokens. Configure an OAuth 2.1
provider with authorization-code/PKCE and a supported client registration mechanism.
Access tokens must be ES256 or RS256 JWTs with the configured issuer, the exact
resource URL as audience, nonempty subject, issue and expiry times, and
`armature:edit` scope. Opaque tokens are unsupported. Signing keys come only from
the administrator-configured endpoint, never a client-provided URL.

Every MCP request authenticates again, including session deletion. OAuth protected
resource metadata is served at `/.well-known/oauth-protected-resource/mcp` and the
root well-known path. A 401 response advertises its metadata URL. Tokens in query
strings are not accepted. Unknown origins and host headers are denied. Browser
CORS is not enabled; the intended client is a server-side MCP connector.

Each issuer/subject pair hashes to a private directory. Clients cannot choose that
root. Existing traversal and symlink protections remain active. A transport session
belongs to one user, with at most four open documents. There is one transport session
per user, at most 32 per process, a 30-minute idle timeout, and a 1 MiB request limit.
Parallel operations on one session receive 409 and must be retried sequentially.
No standalone server-event stream or batch JSON-RPC is supported. Session IDs are
random, checked against ownership, and are not authentication credentials.

`document.save` persists skeleton JSON within the private volume. Unsaved edits and
undo history are lost on expiry/restart. Complete effects/slot editor projects are
not persisted by that tool. Existing tool failures retain their error codes, but
hosted responses redact internal paths and details. The server does not log tokens
or document contents.

## Remaining public-launch gates

- Provision and verify the actual OAuth provider, HTTPS host, volume and proxy.
  Check token revocation policy and the complete ChatGPT sign-in flow.
- Add and exercise per-user storage quotas, upload/download workflows, account
  deletion and retention controls, plus infrastructure request/rate/concurrency
  limits. The present session/body/heap bounds do not provide a full public-service
  resource budget. CPU-heavy tool calls still share the process.
- Review accurate annotations for every tool before the store tool scan.
- Verify container build/start, mounted-volume permissions, restart persistence,
  and two real accounts against the deployed URL. Local JWT fixtures do not prove
  identity-provider interoperability. Add operational monitoring and backup/restore.
- Publish factual support/privacy/terms pages, verify the portal's domain challenge,
  supply reviewer data, record the demo, and complete review and publication.

The Railway connection was marked installed on 2026-09-13, but this working session
exposed no Railway deployment tools. No infrastructure has been provisioned here.
Do not interpret the configuration files as a deployment result.

## Local verification (2026-09-13)

MCP package: 108 tests passed, including 11 authenticated HTTP tests. Tests exercise
real signed JWT verification with a fixture JWKS response, ownership isolation,
expiry, capacity, invalid signatures/claims, scope, host/origin checks, request
bounds, editing, undo/redo, save/reopen, and persistence across transport deletion.
The first persistence fixture was rejected because it had no root bone; adding a
valid root made that test pass without changing format validation.

All eight MCP dependency builds succeeded (seven cached); the bundled HTTP server
started and answered its health check. Existing stdio smoke passed all 208-tool,
editing, deterministic PNG, save/reopen and traversal checks. Targeted lint and
format checks passed. Local Node is 24.19.0; CI uses the repository's 24.20.0 pin.
Docker is unavailable locally. The required CI container job builds the image,
checks non-root volume access, and verifies a sentinel survives container restart.
Its result must be checked on the PR; configuration alone is not a passing result.
