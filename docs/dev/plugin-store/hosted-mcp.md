# Hosted MCP resource server

The staging backend is deployed on Railway and has passed authenticated workflow and
restart-persistence checks. It is not an approved public store listing. It shares all
215 tools and command/history behavior with stdio.
The desktop application and its project format are unchanged.

The optional [Stripe subscription integration](../stripe-subscriptions.md) adds a
separate billing sign-in flow and hosted tool entitlement checks. Keep billing
unconfigured until its account, sandbox verification and activation steps are complete.

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
For Railway, set the Dockerfile path to `deploy/mcp/Dockerfile`, health check to
`/healthz`, and one replica using service settings. Do not select the legacy
`deploy/mcp/railway.json` file: Railway rejected that configuration path as deprecated.
Attach a private persistent volume at `/data`. Railway mounts volumes as root;
set `RAILWAY_RUN_UID=0` and `ARMATURE_INIT_VOLUME=1` for this container's entrypoint.
It changes ownership and mode of only `/data`, clears supplementary groups, and
permanently drops to UID/GID 1000 before importing the server. Root startup without
explicit volume initialization fails. Normal Docker deployments still default to
the non-root `node` user. Never make the data volume public.
See [Railway volume permissions](https://docs.railway.com/volumes#permissions).
The container contains the self-contained server bundle and license, not repository
source or build dependencies. It runs one replica because editing sessions are in memory.

The optional `ARMATURE_OPENAI_CHALLENGE_TOKEN` serves the portal-issued public domain
proof as plain text at `/.well-known/openai-apps-challenge`. It is disabled when
unset, accepts only a bounded URL-safe token, and retains host/origin checks. The
proof is not an authentication credential and grants no tool access.

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
undo history are lost on expiry/restart. Complete projects, including effects, slot scenes and textures, are saved with
`project.save` and restored with `project.open`; `document.save` remains skeleton-only. Existing tool failures retain their error codes, but
hosted responses redact internal paths and details. The server does not log tokens
or document contents.

## Remaining public-launch gates

- Complete the interactive OpenAI authorization-code/PKCE flow with real user and
  reviewer accounts. The deployed service-to-service token test does not prove user
  sign-in. Registration remains disabled; configure deliberate account onboarding
  and recovery. Review token revocation policy (JWTs remain valid until expiry).
- Storage quotas, private asset upload/download/delete and request/connection bounds
  are implemented and tested (see the 2026-09-15 launch update). Complete identity
  deletion and retention operations remain to be verified with the identity provider.
  CPU-heavy tool calls still share the process; isolated workers remain a scaling gap.
- Run the portal tool scan after user OAuth succeeds. All 208 tools now have explicit
  read-only, destructive and closed-world annotations; metadata is also included in
  the generated JSON catalog. Read tools: 41; additive operations: 28; operations
  replacing or removing state: 139. Undoable changes still count as destructive.
- Exercise isolation with two real human accounts against the deployed URL. Local
  signed-JWT tests cover tenant isolation; deployed smoke uses one dedicated service
  account. Add operational monitoring and test backup/restore; persistent volumes
  alone are not backups.
- Publish factual support/privacy/terms pages, verify the portal's domain challenge,
  supply reviewer data, record the demo, and complete review and publication.

## Verified deployment (2026-09-14)

Project `bfe501cf-b27d-45e3-9c79-837fc8edf14d`, production environment:

| Service | Source | Persistence / endpoint |
|---|---|---|
| armature-mcp | `jwillz7667/armature-2d`, `feat/hosted-mcp`, `deploy/mcp/Dockerfile` | 500 MB at `/data`; https://armature-mcp-production.up.railway.app/mcp |
| armature-auth | `quay.io/keycloak/keycloak:26.7.3` | Uses the private database; https://armature-auth-production.up.railway.app/realms/armature |
| armature-auth-db | `postgres:18-bookworm` | 500 MB at `/var/lib/postgresql`; private network only |

The MCP deployment at commit `a28a4a0` succeeded. Runtime logs confirm UID/GID 1000
and startup on port 8080. The auth realm and service client issued a real signed JWT.
Authenticated MCP requests returned 200; deliberate unauthenticated probes returned
401. Reviewed current logs showed no MCP 5xx responses. Auth readiness warnings and
PostgreSQL missing-table errors were confined to initial setup; migrations completed.
Keycloak's default deprecated-feature warnings remain non-blocking.

Actual live results: **17 workflow checks passed**, covering discovery, issuer and
trusted token endpoint, token issuance, unauthorized denial, initialization, all 208
tools, edits, undo/redo, validation, deterministic PNG, save/reopen, traversal denial,
and session cleanup. **9 checks passed after an actual MCP service restart**, including
reopening and comparing the saved document. PNG verification used an atlas-free
fixture with an explicit viewport; it does not establish textured remote rendering.
The local stdio smoke separately verifies a real texture fixture.

`deploy/auth/openai-client.json` defines the separate `armature-openai` public client
for the exact callback displayed in this portal draft. It requests user consent,
requires PKCE S256, disables implicit/password/service-account grants, and receives
only the existing `armature:edit` scope/audience. It contains no shared secret.
`deploy/auth/railway-start.sh` adds it with Keycloak's `SKIP` partial-import policy,
using the existing admin credential only inside the auth container. Its temporary
credential files are private and removed on exit. Existing realms, users, signing
keys and the machine test credential are preserved. See the auth deployment recipe
for the difference between import success and verification of existing client settings.
Auth deployment `1fc547ba-9c9c-4cd2-8ef2-d35c0693b736` succeeded; its logs explicitly
verified the exact callback, public client, PKCE S256, consent and code-only grants.

## Test evidence

- Current local MCP suite: **110 tests passed in 5 files**, including 13 HTTP tests.
  These cover signatures/claims, scope, ownership, expiry, session/body limits,
  host/origin checks, traversal/symlinks, editing, history and persistence. The HTTP
  workflow also verifies that permission annotations reach the actual wire catalog.
- Type checking, targeted lint, all eight dependency builds (seven cached), generated
  catalog validation, and stdio smoke passed. Local Node is 24.19.0, below the
  repository's 24.20.0 pin; CI runs the pinned version.
- At `a28a4a0`, [CI run 34799625363](https://github.com/jwillz7667/armature-2d/actions/runs/34799625363)
  passed all 14 jobs, including the container test that initializes a root-owned
  volume, verifies UID/GID 1000 and cleared supplementary groups, checks write access,
  and proves a sentinel survives restart. Root without explicit initialization fails.
  [Native conformance run 34799625380](https://github.com/jwillz7667/armature-2d/actions/runs/34799625380)
  also passed. These run IDs apply to that commit, not automatically to later changes.

At `a17eed3`, [CI run 34801456829](https://github.com/jwillz7667/armature-2d/actions/runs/34801456829)
and [native conformance run 34801456844](https://github.com/jwillz7667/armature-2d/actions/runs/34801456844)
both passed. Railway MCP deployment `4388e034-e133-4733-8acf-38664e434c39` succeeded
with UID/GID 1000. A further **11 live checks passed** after that deployment: real
token issuance, authentication denial, session initialization, all 208 permission
annotations and representative classifications, saved-document equality, and cleanup.
The OpenAI portal confirmed **Domain verified**. Continuing to user OAuth then
encountered a browser connection timeout, including the prescribed fresh-tab recovery;
that flow has no verified outcome.

No real Codex/ChatGPT user OAuth session, completed portal tool scan, verified public
policy pages, store approval, or public publication is claimed by these results.


## Launch implementation update (2026-09-15)

All 215 tools now declare output schemas generated from handler return types and
validate their serialized results. MCP supplies matching structured content and
legacy JSON text. The generated-catalog CI step checks both schema and catalog drift.
The `project.export`, `project.save`, and `project.open` tools use the existing
complete-project format without changing its version or bypassing commands. They
preserve skeletons, effects, slot scenes and referenced textures. Embedded assets
are hash-validated and never automatically extracted into arbitrary files.

`workspace.upload` accepts canonical base64 JSON/PNG assets up to 512 KiB, PNGs at
most 2048 pixels per side, and simple file names. Listing, download and explicitly
confirmed permanent file deletion are available. Recovery and full-project export
remain available after subscription expiry. Uploading new assets remains paid.

Hosted defaults are 8 MiB per file, 32 MiB and 256 files per tenant, 256 MiB and
4096 files across the data root, and a 64 MiB free-space reserve. Accounting is
recomputed from persisted files under a shared write lock; restarts cannot reset
it and concurrent tenant writes cannot overbook the volume. There is a 120-request
per minute authenticated-user budget and 1200-request global budget with Retry-After,
128 TCP connections and 100 requests per socket. Health checks bypass rate limits.
These are single-process limits and do not claim distributed or CPU-worker isolation.

Public registration and email recovery remain disabled. Railway's connected tools
could inspect configuration but could not enable native backup schedules. Stripe's
additional CLI tools could not initialize their required local socket, so restricted
key replacement was not performed. No store approval, reviewer login, real Checkout
completion or actual deployed webhook delivery is implied by the implementation tests.
