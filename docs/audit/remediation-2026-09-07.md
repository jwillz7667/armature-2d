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
| F18 | Full effects controls, lifetime graphs, bundles, seeded textured preview | Implemented; 67 core, 77 MCP, and 3 workflow tests pass; desktop acceptance pending |
| F19 | Slot controls, bindings, feature graph, and composed scenario preview | Implemented; command/workflow/timing tests pass; desktop acceptance pending |
| F16 | Explicit import profiles, sibling atlas transaction, loss reports, worker budgets | Implemented safeguards and JSON asset workflow; real-export binary profile/corpus and desktop fidelity acceptance pending |
| F14, F29 | Native pixels, deform mixing | Pending |
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

## Effects designer verification

- Full emitter, sprite, and ribbon parameter controls dispatch reversible commands. Trails and their lifetime curves change atomically.
- Bundles have editable items, order, offsets, anchors, and seed salts. Texture imports feed the effects preview resolver.
- Fixed-clock preview tests prove identical moving-anchor bundle states at 30/60 Hz, fresh restarts, and different-seed variation.
- A blank-project authoring test creates effects, curves, trails, and a bundle, then verifies complete save/reopen including PNG pixels.
- Regression tests cover invalid reorders, duplicate bundle names, multi-field coalescing redo, and both MCP trail editing paths.
- Built editor and type/lint checks are required; actual desktop rendering is still not claimed by these headless tests.

## Slot composer verification

- Complete GUI controls cover symbol phase bindings, win-step targets/actions/order, graph states/transitions/predicates/cinematics, reel timing, anticipation, and tumble timing/easing.
- Project-symbol textures, feature cinematics, and effects/bundles share the composed preview. Missing external assets surface diagnostics. Recorded results are bounded, validated transient inputs.
- Three new configuration commands and MCP tools validate before mutation. Reorder composition and replacement-ref bookkeeping now undo/redo correctly. Project serialization refreshes internal content hashes without editing history.
- Regression tests cover delayed sprite visibility, scheduled phase clocks, interpolated survivor positions, cascade ordering/stagger, final counter completion, and seeded 30/60 Hz playback.
- Slot golden fixtures changed intentionally for timing fixes. Generation used the documented integer-only off-pin override on Node 24.19.0 because the local Node differs from the repository pin; installed/native verification is not claimed.
- GitHub CI inspection exposed a stale format public-export allowlist from the project addition and two unformatted effects files. This change repairs both and reruns the broader checks.
- Full workspace run: 4,792 tests passed and one stale import-confirmation test failed. Its corrected file now passes all five tests, including a new cancel-preserves-dirty-work regression (4,794 passing tests across the run and targeted rerun). Editor build, type checking, formatting, and changed-source lint pass.


## Import and image-boundary verification

- Importer: 86 tests pass, including strict minor/syntax gates, draw-order preservation, escaped loss paths, prototype/cycle rejection, and binary decoder negative cases.
- Editor: 26 focused import/media tests pass, including asymmetric quarter-turn pixels, trim offsets, real PNG bytes, missing/unsafe assets, and cancellation preserving dirty work.
- PNG preflight rejects oversized dimensions and duplicate headers before allocation. Atlas-pack's 66 tests and six budget/public-surface checks pass.
- Real binary import is gated because the existing binary tests use synthetic streams. The new capability matrix does not label them as actual export verification. A permitted real-export corpus remains needed before enabling a production binary profile.
- Source deformation uses a different coordinate space from Armature. It is now explicitly reported and omitted instead of truncating deltas into an incorrect animation; faithful deform conversion remains a format/runtime interoperability task.
- The built Spine worker imports a rig, sibling atlas, and PNG. Built video startup and PNG/GIF/APNG worker smoke checks pass. Installed desktop acceptance remains pending.
- Full editor run: 657 tests passed; one preflight error-message regression was corrected to preserve the existing ATLAS_DECODE_FAILED contract. Its nine-test file is rerun separately. Additional atlas/IPC/file-action coverage passes 56 tests. No real-export binary or source-animation fidelity claim is made.
