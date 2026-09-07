# Audit remediation, 7 September 2026

Owner directive: fix all gaps identified in the repository audit of main at
46d367b4e5fe07f74cc64e376580ad21de16cb09. Preserve the command, format and deterministic
presentation boundaries. Work proceeds in verified subsystem changes.

## Status

| Findings | Work | State |
|---|---|---|
| F06, F07 | Mesh command safety and complete animation duration bounds | Implemented, 2,290 document-core tests pass; published in command-safety PR |
| F21 | Filesystem link confinement and bounded file I/O | Implemented; 89 MCP tests pass; PR #30 |
| F02-F05, F09 | Project persistence, asset history, recovery, document identity | Implemented; 91 targeted core and 66 editor integration tests pass; desktop acceptance pending |
| F08, F10-F13, F15 | Displayed pose, video startup, physics/export/native skin context | Implemented; pixel/player/worker checks pass; engine and WebCodecs acceptance pending |
| F20 | Complete MCP solved-pose/deform feedback and generated reference | Implemented; command and MCP integration checks pass |
| F17 | Constraint creation, parameters, target handles, and timeline authoring | Implemented; command/workflow tests pass; desktop acceptance pending |
| F14, F16, F18-F19, F29 | Native pixels, import capability, effect/slot UI, deform mixing | Pending |
| F01, F22-F28 | Repository, dependencies, CI, release, docs, performance, acceptance | Pending |

## Evidence and environment

- Command change: local f5b2380; GitHub 4a9bfbd69a19da89dcfb9786d74cbf800cdf8148.
- Node 24.19.0 and pnpm 11.19.0 locally; CI uses repository pins.
- No interactive desktop/native-engine verification has been claimed.
- Git transport has read access but no push credential. Repository writes use the connected GitHub API.
- Signing identities and actual Windows/macOS/Unity device acceptance must be checked before a release.

Update this ledger with actual implementation and verification. Do not mark a gap complete merely
because an unsupported-feature label or a plan exists.

## Project repair verification

- Project version 0.1.0 adds complete editable persistence without changing the runtime format versions.
- Targeted core tests: 91 pass, including the remaining time-zero-only animation-duration boundary.
- Targeted editor integration tests: 66 pass. Editor and document-core type checking and changed-file lint pass.
- Electron production build succeeds. It still reports the known video-worker Node codec dependency (F10),
  which is the next repair; a successful bundle alone does not prove video encoding works.
- IPC sender validation, denied navigation/popups/webviews/permissions, and asset byte/pixel budgets are
  implemented for F23. Further media-job and import limits remain in the export/security workstream.
- Recovery currently snapshots valid editable project state. Invalid transient edits surface a Problems
  error and retain the prior recovery copy. Automatic installed-app recovery acceptance remains required.

## Render and export repair verification

- 107 render-preview tests pass, including byte goldens and the browser/Node RGBA comparison.
- Two additional export-context tests pass: selected skin/default fallback and reproducible ranged physics.
- 16 packaged-player tests pass, including physical state progression and deterministic absolute seeks.
- 35 targeted editor export/selection tests pass.
- The built video worker starts in a VM without Node globals. The built media worker exports PNG/GIF/APNG
  and can be terminated. These tests now run in the CI build job.
- Native wrappers forward the selected skin to the sampler; actual engine verification remains pending.
- The complete project includes effects and slot authoring; the media dialog still exports a skeletal clip.
  A composed scene/effects media workflow remains part of the authoring completeness work.


## Constraint authoring verification

- 2,332 document-core tests pass, including the registered command round-trip harness, key identity,
  imported IK depth preservation, and explicit easing replacement.
- Four editor workflow tests cover IK, transform, and editable path creation, keys, solve, project
  save/reopen, undo/redo, and rollback when a compound path creation fails its final validation.
- Editor production build, type checks, and changed-source lint pass. Native desktop interaction remains
  an acceptance task, not evidence provided by these headless tests.
