# Armature 2D public plugin submission

Status: saved OpenAI Platform draft, not submitted or published.

Draft app ID: `asdk_app_6aa6cb80da2c8191a768d23d0411bc39`.
Draft version: `0.1.0`. The portal rejected the prerelease version string.
The listing, prompts, skill upload and review scenarios were entered. The skill
scan passed. The hosted MCP URL and predefined OAuth client settings have been
entered; interactive sign-in and the tool scan are not yet verified. Public policy
URLs were unset in the portal when last checked. The privacy policy was published
with Armature 2D coverage on 2026-09-15 at
`https://www.viral-ventures-llc.com/privacy#armature-2d`; entering it in the portal
remains unverified. Starting the tool scan generated the domain challenge and
opened an Authorize MCP dialog. The exact issued proof is configured in Railway;
the server implements the well-known proof route. The portal confirmed **Domain
verified** on 2026-09-14. After continuing from Authorize MCP, browser tab discovery
timed out; a fresh-tab recovery also timed out. User sign-in and tool-scan status
remain unknown, and neither is claimed as successful.
See [hosted MCP status](hosted-mcp.md) for backend implementation and launch gates.

## Listing draft

Name: Armature 2D
Draft publisher: JUSTIN THOMAS WILLIAMS (verified individual selected in the portal; business identity has not been verified)
Category: Productivity
Short description: Rig, animate and render 2D skeletons with Armature.
Long description: Create and edit skeletal rigs through Armature's command and undo system. Author bones, slots, attachments, animation and constraints; inspect the document, render PNG previews, and validate and save skeleton JSON. The current engine operates in independent headless sessions. It does not control a running editor window or persist a complete effects/slot editor project.
Logo: plugins/armature/assets/icon.png
Source: https://github.com/jwillz7667/armature-2d
Privacy policy: https://www.viral-ventures-llc.com/privacy#armature-2d
Privacy contact: privacy@viral-ventures-llc.com

Starter prompts:
- Create a two-bone puppet, render a preview, and save the skeleton.
- Open my skeleton, adjust its root position, and verify undo and redo.
- Validate this skeleton and explain any errors before saving.

## Review scenarios

Use an isolated project folder. Positive scenarios use the same small texture and
rig created by tools/smoke-mcp-cli.mjs. Reviewers need that fixture or equivalent
review-account data once a hosted service exists. These are review specifications;
they are not a claim that the hosted plugin has been tested.

| Case | Prompt/scenario | Expected behavior and result |
|---|---|---|
| P1 | Create a skeleton with a root and child bone | document.new and bone.create return valid IDs; export contains the hierarchy |
| P2 | Move the root, undo it, then redo it | Original export restored by undo; edited export restored by redo |
| P3 | Render the textured skeleton twice with identical settings | Two identical PNG payloads, requested dimensions, placeholders false |
| P4 | Save my skeleton and reopen it | document.save succeeds within the project root; reopened export matches saved data |
| P5 | Validate the completed skeleton | document.validate returns ok true with no errors |
| N1 | Save the skeleton at ../outside.json | PATH_FORBIDDEN; no write outside the configured project root |
| N2 | Launch without selecting a project directory | Launcher fails with an actionable diagnostic and no protocol output |
| N3 | Control the editor window or claim effects are saved by document.save | Skill explains the limitation; no fabricated action or persistence claim |

## Blocking requirements

1. Remote MCP is deployed at `https://armature-mcp-production.up.railway.app/mcp`.
   Authenticated machine-client workflows and restart persistence passed. All 208
   tool annotations are implemented and tested. Complete user OAuth and the portal
   tool scan, two-account live isolation, and public-service resource/storage controls.
   The local portable bundle remains available independently of public store approval.
2. Publisher access: sign-in and draft creation succeeded in the Personal organization.
   The verified individual identity was selected and confirmed saved. Confirm the
   final listing and policy publisher match before submitting; do not claim the
   business identity has been verified.
3. The Viral Ventures LLC privacy policy now explicitly covers Armature 2D,
   hosted project storage, AI-client exchanges, Railway hosting, Stripe billing,
   session cookies, retention, and verified deletion requests. Its production page
   returned HTTP 200 with the new section on 2026-09-15. Use the privacy URL above.
   Public product website, support and terms URLs still need review, and the
   listing's publisher identity must be reconciled with Viral Ventures LLC.
   Do not claim a draft policy is approved. Domain verification
   requires the exact challenge issued by the portal.
4. Supply working reviewer credentials if authentication is used and test the actual
   remote workflows. The local cross-platform tests do not substitute for these checks.
5. Select supported availability and confirm the portal's attestations based on facts.
   OpenAI review and subsequent publisher release are required for public listing.

A local marketplace entry is not publication in the public store. Do not submit an
empty MCP configuration or reclassify this dependency as a working skills-only service.

Sources checked: [submission requirements](https://developers.openai.com/plugins/deploy/submission)
and [portable packaging](https://developers.openai.com/plugins/build/plugins).

## Connection draft

- Registration: pre-defined; client ID `armature-openai`; token auth method `None`.
- Redirect URI: `https://chatgpt.com/connector_platform_oauth_redirect`, as shown by
  this portal draft. The client restricts redirects to exactly this address.
- Requested scopes: `armature:edit openid`; issuer and endpoints are discovered from
  the hosted Keycloak realm. Do not paste the `armature-service` secret into the portal.
- OIDC `email` scope / verified-email onboarding are not configured. Enterprise
  workspace domain restrictions therefore remain unavailable.
- The interactive scan still requires user OAuth. Do not treat the OAuth client
  configuration as a successful end-to-end user connection.
