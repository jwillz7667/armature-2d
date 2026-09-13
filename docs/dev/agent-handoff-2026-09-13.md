# Armature 2D handoff, 13 September 2026

## Objective and authorization

Repository: https://github.com/jwillz7667/armature-2d

The user requested a complete audit, remediation, then explicitly authorized merging everything and creating a new version/release. The latest request is to hand this work to a cheaper model. Continue from this checkpoint; do not restart the audit or ask for merge/release permission again. Never claim all audit gaps are closed.

## Current state

- All 16 audit PRs, #29 through #44, are merged without conflicts. No audit PR remains open.
- Main: `240a43b833936e31b59929aebfaf912a91922809`. Its tree exactly matches the previously tested combined audit branch. Main CI run `34567352152` and native conformance run `34567352147` both passed.
- Release preparation is on `release/0.2.0-rc.1`, including this handoff. It has NOT been merged, tagged, packaged, or published.
- Candidate version: **0.2.0-rc.1**, deliberately a prerelease because GPU/installed-app acceptance is outstanding. Root/editor manifests now match. Skeleton format remains 0.6.0.
- Release changes: `.github/release-request.json`, `.github/workflows/release.yml`, `tools/prepare-release.mjs`, `tools/release-check.mjs`, `tools/release-assets.mjs`, installer-inventory tests, and `docs/releases/0.2.0-rc.1.md`.
- Release preparation validation: 24 focused release tests, changed-script lint, formatting and dash guard passed. The modified workflow has NOT run end to end yet.

## Finish the release first

1. Open/reuse a PR from `release/0.2.0-rc.1` to `main`. Inspect the workflow and run its PR checks. Fix failures without weakening gates.
2. Merge using the expected head SHA after checks pass. User authorization already exists.
3. Merging the explicit release-request file starts Release. It waits for CI AND native conformance on the exact main commit, creates an immutable tag, reruns release gates, builds all platform installers, generates SHA256SUMS, and publishes as a prerelease only after the complete installer set passes.
4. Watch the actual run through completion. Inspect failed job logs and repair packaging issues. Never move a published tag or report queued builds as a released product. If a repair requires a new commit after tagging, use a new candidate version.
5. Verify the public release, tag commit, both macOS architectures, Windows x64, Linux AppImage/deb/rpm, and checksums. Builds are unsigned; do not claim signing, notarization, or installed-app acceptance.

## What is already fixed

Command/history safety; portable project/assets and atomic saves; identity/unsaved-work guards; startup recovery and a 20-project/2-GiB storage budget that preserves old copies; confined MCP file access; bounded atlas/PSD/ORA/Spine import workers; deterministic compact atlas pages; constraint/effects/slot authoring; TS deform mixing; native triangle clipping; Unity dark tint/alpha plumbing; export cancellation/write cleanup; supported dependencies and required CI/fixture/advisory gates.

Evidence and full finding ledger: `docs/audit/remediation-2026-09-07.md`. Latest focused batches: 22 export/read tests and 51 recovery tests. Their PR/main CI and native conformance passed. Headless C# tests do not compile UnityEngine wrappers or shaders.

## Remaining fixes and enhancements, in order

| Priority | Work | Completion evidence |
|---|---|---|
| P1 | Verify Unity shader/mesh uploader and Godot GPU output; finish Godot dark tint, premultiplied alpha, and screen blending | Engine-rendered pixel comparisons for all blend modes, transparent edges, clipping and alternate skins; no normal-blend fallback labeled as screen support |
| P1 | Wire composed effects/slot media export into the editor; it currently exports skeletal clips | Preview/export parity for selected skins, clipping, effects and deterministic recorded outcomes |
| P1 | Persist invalid transient editing drafts and add recovery management | Crash/restart restoration without requiring runtime-valid export; explicit selection/deletion of copies; preserve current valid backups |
| P1 | Complete Spine import fidelity | Permitted real-export binary corpus before enabling production binary import; correct conversion of Spine local pre-skin deform semantics to Armature world post-skin semantics, or retain explicit loss reports |
| P2 | Playback edge cases | Deterministic backward seeks with slot physics; stable framing; clear stale displayed-pose/hit-test caches; targeted regression cases |
| P2 | Runtime/composition completeness | Native layered AnimationState API and mixing parity; resolve external multi-skeleton slot references |
| P2 | Filesystem/platform acceptance | Windows/macOS confinement and atomic-write checks, installed Electron dialogs, large-project save/import/export/close recovery flows |
| P2 | Performance | Representative large rigs/effects/slot scenes; frame-time percentiles, memory/retained heap, import/export timing, and explicit budgets. Do not equate low retained heap with zero allocations |
| P2 | Repository/release governance | Verify default branch and required checks/rules; connector has no administration capability. Finish signing/notarization and OS installer acceptance before stable release |
| P3 | Documentation/product polish | Keep capability matrix, onboarding, import diagnostics and recovery UX consistent with tested behavior; preserve proprietary licensing and the user's planned $20/month product direction |

Do not expand into speculative features before these concrete gaps. The original audit's optional ideas are not all implemented; consult the ledger/specs rather than inventing completion claims.

## Working constraints and efficient workflow

- Read `CLAUDE.md`; respect command-only document mutations, do/undo/coalescing tests, barrel import boundaries and pure deterministic runtime-core. No em/en dashes in repository files.
- Spine clean-room rule: public format documentation and permitted user exports only. Never open/copy Spine runtime or editor source.
- Preserve existing Electron/React/Pixi/Zustand architecture. No unsolicited licensing/payment changes.
- Workspace: `/workspace/scratch/3934fd15a9df/armature-2d`. Re-clone the release branch if scratch expires. Evidence logs are in the sibling `audit-evidence` directory.
- Host Node is 24.19.0; CI is pinned to 24.20.0. A downloaded 24.20 binary segfaulted here. Do not claim local pinned-toolchain verification. Use CI for byte-exact fixture regeneration.
- Public git clone/fetch works; shell push has no credentials. Connected GitHub tools can create trees/commits/branches/PRs, merge with expected SHA, read runs/logs and rerun jobs. API-created commit hashes differ from local hashes; compare tree hashes.
- Discover GitHub tools through filtered `ALL_TOOLS`. Generic GitHub fetch supports approved GET API URLs, including main push runs; `fetch_commit_workflow_runs` returns PR runs only. Summarize API payloads rather than dumping them.
- The new release workflow uses its normal Actions token to publish. Do not extract credentials or bypass gates/access controls.
- Prefer one bounded fix, focused tests, then normal CI. Keep updates concise; no need for parallel agents unless the user requests them.
