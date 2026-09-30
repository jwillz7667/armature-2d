# Submission continuation, 2026-09-30

The existing Safari draft was recovered and updated directly. It still uses the
legacy form and accepts the repository-root JSON import. The newer published
submission documentation also describes ZIP uploads; do not create a duplicate
plugin solely to switch forms.

## Verified this session

- PR #50 is merged into main at 9e4f1eb. The repository default branch still points
  at the old foundations branch, so submission work must use main explicitly.
- Production `/healthz` returned 200 and protected-resource discovery returned the
  expected Armature issuer and `armature:edit` scope.
- Imported the current JSON into existing app
  `asdk_app_6aa6cb80da2c8191a768d23d0411bc39`, version
  `asdk_app_v_6aa6cb827db081918b31815a6da8e4d0`. The updated description and subtitle
  were visible in the portal.
- Filled website, customer support, privacy and terms URLs and saw Draft saved.
  Support is the real homepage `#contact` section; `/contact` returns a 404 page.
- Domain verification remains verified.
- Reproduced a real authorization failure: `invalid_scope` for the discovered
  `openid offline_access armature:edit` request. The configured public client has
  no optional offline_access scope. Disabled the portal's optional OIDC
  domain-claiming feature while preserving OAuth, PKCE and explicit
  `armature:edit openid` scopes. The next request reached the real Armature login
  page. The reviewer account subsequently completed login; the scan remains incomplete.
- Validated the legacy submission file against its official JSON Schema; it
  contains 215 tools. Validated the separate hosted package against the official
  Agent Plugins schema and the local Codex package/skill validators.

## Hosted package

`plugins/armature-hosted` contains the public remote MCP configuration, hosted
instructions, existing logo, public URLs and the five positive/three negative
review cases. It is separate from the local-engine package. The root Agent Plugins
manifest is authoritative; its supported `supportURL` field is omitted only from
its compatibility Codex manifest because the bundled local validator predates it.
No account credentials, executable engine or local workspace grants are included.

## Still required

- Finish the MCP tool scan after deploying the bounded connection fix.
- Execute the review scenarios against that account and record a real walkthrough.
- Reconcile the selected verified individual publisher with the company's policy
  and package identity. Do not claim business verification exists.
- Confirm availability and factual policy attestations in the portal.
- Review PR #51 separately for account email setup; its CI is green but its notes
  say DNS and actual mail delivery are unfinished. Its prepared bootstrap is already in the live start command, but delivery remains unverified.
- Billing remains unactivated; no Checkout or webhook verification was performed.

No submitted-for-review, approval or publication result is claimed.

## Reviewer account provisioning

At the user's explicit request, created a dedicated non-admin reviewer account
through the auth service's additive partial import. The password is random and
kept outside the repository and public package. Deployment
`8979babc-ebf3-4f90-bbe1-0f7a2a6b45af` succeeded, and the account authenticated in
Safari. The account's mandatory profile step was completed using a reserved
non-deliverable test email; no email verification is claimed. The bootstrap import
was restored to client-only configuration after creation (without another restart).

The same deployment exposed an existing prepared-email verification error:
`Armature email verification failed: configuration drift.` Both OAuth clients
passed their explicit security checks. Email recovery readiness remains unverified.

## OAuth and scanner findings

The reviewer account authenticated and its credentials were saved in the portal’s
private Testing field. Five positive and three negative cases and release notes
are present. No credentials are included in this repository.

Keycloak’s evaluated access token had the correct issuer, audience and scope but
no `sub`. Added the explicit subject mapper without weakening resource-server
validation. Auth deployment `e26d9d60-2f73-4bac-b147-a1f4fc014cc6` configured it
successfully. Temporary claim diagnostics were removed from the start command.
The next real OpenAI scan progressed from 401 to authenticated 200, followed by
429 when its second transport connection hit the one-session-per-owner limit.

The proposed server fix permits at most four sessions per owner (32 globally)
and serializes requests across that owner’s connections to protect shared files.
Tests cover discovery on a second connection, per-owner and global capacity,
cross-account isolation, blocked concurrent access during a save, and reopening
the saved file on the other connection. All 170 MCP tests, the eight-package
server build, scoped typecheck and ESLint passed.

The portal’s remaining factual gates are the completed scan and a real demo
recording URL. Legal and policy attestations remain unchecked. The hosted skill
archive is prepared, but Safari’s upload chooser disabled both ZIP and folder
selection; the existing passed skill has not been replaced or deleted.
