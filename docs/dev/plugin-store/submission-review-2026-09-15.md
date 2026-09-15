# Armature 2D submission review - 2026-09-15

## Result

Generated `chatgpt-app-submission.json` at the repository root: Armature 2D,
subtitle "Rig, animate and render 2D", Productivity, all 215 MCP tools,
five positive cases and three negative cases. This is an import draft, not an
accepted or published listing. Test cases are reviewer instructions, not a claim
that the ChatGPT flows have already passed.

Used OpenAI's official `chatgpt-app-submission` skill from
https://github.com/openai/openai-developers-for-cursor at commit
`9120f1f6bb47964651ab822e24b4f358e3638ae3`.
The schema endpoint in the skill's older example resolves to the current canonical
https://developers.openai.com/plugins/schemas/chatgpt-app-submission.v1.json;
the artifact uses that canonical URI and is validated against the downloaded schema.

## Review findings and next steps

- Tool hints: all 215 tools explicitly set all three required boolean annotations;
  the artifact matches the generated source catalog exactly. Mutations remain
  confined to private projects. Save can overwrite files; packing writes atlas
  files that document undo cannot restore; close discards unsaved session changes.
- Sensitive input solicitation: no obvious fields requesting payment card data,
  credentials, MFA codes, health data, or government identifiers were found in the
  tool schemas. Project content and paths may contain user-provided personal data;
  handle these under the published policy and retain existing path/auth safeguards.
- Tool data use: source inspection found no unexplained sensitive-data collection
  in project tools. Returned snapshots, exports and previews expose project data
  to the invoking client. The listing describes private project workflows and the
  public policy explains AI-client exchanges. Review live account isolation before launch.
- Naming and descriptions: `document.getSnapshot` now describes its full skeleton snapshot.
  Do not imply desktop control, texture synthesis, complete binary Spine import,
  or desktop UI control. Complete-project persistence is now exposed using the
  existing editor format; the headless limitation remains explicit.
- Widget CSP: no MCP widget UI is exposed by this server, so widget CSP review is
  not applicable; retain the separate billing-page CSP safeguards.
- Output schemas: all 215 tools now expose generated Zod/JSON output contracts and
  validated structured results, retaining JSON text for older clients. Contracts
  derive from actual handler return types, including typed view helpers. The CI
  catalog check rejects stale contracts. There are no missing outputSchema warnings.
  See https://modelcontextprotocol.io/specification/2025-11-25/server/tools.

## Verification and release limits

- Current package suite: **169 tests passed in 11 files**, including complete-project
  persistence with embedded-texture rendering after external asset removal, tampered
  project rejection, storage/restart/concurrent-write limits, workspace transfers and
  request throttling. All existing handler tests now validate their output contracts.
- Package typecheck/build and the packaged-plugin smoke passed. The portable archive
  verified its checksum, manifests, explicit-root rejection and isolated MCP workflow.
- Runtime is Node 24.19.0 locally; the repository and CI pin Node 24.20.0. CI and
  live deployment results for the final commit are recorded separately in PR #50.


- Source catalog freshness: `pnpm --filter @marionette/mcp-server reference:check`
  passed, verifying 215 tools.
- JSON: validated using the current official JSON Schema, with exact tool coverage,
  exact annotation parity, five positive and three negative cases, valid action
  references, and the subtitle length constraint checked independently.
- Previously completed Stripe sandbox verification: 29 checks covering trial,
  monthly/yearly Checkout creation, renewal, cancellation, failed-payment denial,
  recovery, portal creation and preventing a second trial. These were API/service
  checks, not browser Checkout completion or actual hosted webhook delivery.
- Human OAuth, portal tool scan, reviewer credentials, browser Checkout and real
  webhook delivery remain unverified. Production billing and its webhook remain
  disabled. Do not describe the subscription as launched.
- The published Viral Ventures LLC privacy page covers Armature 2D and is linked
  from billing and Stripe portal configuration. Reconcile the portal's verified
  individual publisher with the policy's business identity and review support,
  product and terms URLs before final attestations.
- No submission upload capability is available in this session. Import the JSON
  into the existing OpenAI Platform app draft, review populated fields and complete
  the remaining connection/reviewer checks before requesting platform review.
