# Submission continuation — 2026-09-30

The existing Armature 2D draft remains under verified individual publisher
JUSTIN THOMAS WILLIAMS. No business verification, OpenAI approval, or publication
is claimed. The app ID is `asdk_app_6aa6cb80da2c8191a768d23d0411bc39`; version ID
is `asdk_app_v_6aa6cb827db081918b31815a6da8e4d0`.

Submission remains a draft. No approval or publication is claimed.

## Production fixes

- [PR 52](https://github.com/jwillz7667/armature-2d/pull/52): OAuth subject mapping, bounded connections, dependency security updates and hosted package.
- [PR 53](https://github.com/jwillz7667/armature-2d/pull/53): reclaim abandoned discovery connections.
- [PR 54](https://github.com/jwillz7667/armature-2d/pull/54): preserve account documents and history across connector reconnects. All 19 CI checks passed; 172 MCP tests passed.
- [PR 55](https://github.com/jwillz7667/armature-2d/pull/55): atlas-less placeholder preview without modifying the document or weakening strict export validation.
- [PR 56](https://github.com/jwillz7667/armature-2d/pull/56): return the exact PNG bytes as native MCP image content as well as the structured result. Authenticated HTTP test decodes the PNG with CRC checking and verifies visible pixels. All 19 CI checks and 174 MCP tests passed.
- [PR 57](https://github.com/jwillz7667/armature-2d/pull/57): exclude only the real volume-root filesystem recovery directory from quota traversal. Production save/open now passes. All 19 CI checks and 176 MCP tests passed.
- [PR 58](https://github.com/jwillz7667/armature-2d/pull/58): authenticated, network-free ChatGPT preview widget displays exact renderer PNG bytes and validates dimensions. All 19 CI checks and 180 MCP tests passed.
- Production deployment `cd241693-ac3d-4f0b-bbc6-50cd1092bda3` succeeded at main `129ca61815d90de7f7a49bad893c44b4f7cfdc1d`.

## Reviewer access

A dedicated non-admin reviewer account was created and authenticated through the real Safari OAuth flow. Credentials are saved privately in the submission Testing section and are excluded from this report. OpenAI's MCP scan and the updated hosted authoring skill scan passed.

## Live tests

1. Passed: created root `bone_1` and child `bone_2`, listed their hierarchy, received validation `{"ok":true,"errors":[]}`, and closed the disposable document with `{"closed":true}`.
2. Passed: root position read after every operation: (0,0), move to (20,0), undo to (0,0), redo to (20,0); disposable document closed.
3. Passed: one-second linear rotation 0–90°, sampled at 0.5s. Matrix [0.7071067811865476, 0.7071067811865475, -0.7071067811865475, 0.7071067811865476, 0, 0] corresponds to 45°; disposable document closed.
4. Passed: the live ChatGPT widget visibly displays the exact 512×512 PNG (1,710 bytes) for a 240×120 atlas-less region, with placeholders=true. Reloaded and verified with custom-app CSP enforcement enabled. Disposable document closed=true. Native MCP image content alone had been insufficient; PR 58 supplies the required UI resource and tool metadata.
5. Passed after PR 57: created root bone, empty sparkle effect and 7×7 cluster grid; saved `reviewer-roundtrip-final.json`; reopened a separate document; exported JSON had zero differences and all four hashes matched. Reopened undo/redo history was empty. Both disposable documents returned closed=true. The saved file remains in the reviewer's private workspace.
6. Passed capability-inventory checks: no desktop/window control, social publishing, or billing/card-charge tool was exposed. No such external action was attempted.

## Walkthrough and submission status

The 95-second `armature-reviewer-walkthrough.mp4` contains cropped actual Safari/ChatGPT screen captures with captions; waiting time is omitted. It is a screen-capture walkthrough, not an uninterrupted recording. No replacement preview image or simulated results are used. It excludes credentials and unrelated browser content.

The portal reports only two remaining issues: the demo URL and the six legal/policy confirmations. MCP and authoring-skill validation previously passed; the private developer app's tools were refreshed after deploying the widget. The final submit action has not been performed.

## Scope and operational notes

The public repository's default branch still points at the old foundations branch;
production and this submission use main explicitly. The hosted package is separate
from the local-engine package. The legacy submission JSON contains 215 tools and
was checked against the official schema. The hosted package and authoring skill
passed package validation; they contain no credentials or local engine executable.

The existing OAuth client remains a public PKCE S256 client with exact ChatGPT
callback, authorization-code flow, no client secret, and armature:edit plus openid
scopes. The optional portal OIDC domain-claiming feature is off to avoid requesting
unsupported offline_access. Strict token issuer, audience, expiry, subject and
scope checks remain enabled. The reviewer account is dedicated and non-admin.

The profile uses a reserved test email. Email verification and recovery delivery
remain unverified; PR #51 is separate. Its prepared bootstrap exists in the live
auth configuration and must not be overwritten inadvertently. Billing remains
unactivated; no Checkout or webhook verification was performed.

Website: https://github.com/jwillz7667/armature-2d
Support: https://www.viral-ventures-llc.com/#contact
Privacy: https://www.viral-ventures-llc.com/privacy#armature-2d
Terms: https://www.viral-ventures-llc.com/terms

The six publisher statements are left unchecked pending action-time confirmation.
They cover OpenAI terms/guidelines, applicable laws, no financial transfers/trades,
third-party rights, suitability for under-18 users, and no under-13 targeting or
sharing of their personal information.
