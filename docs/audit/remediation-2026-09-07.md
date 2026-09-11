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
| F29 | Deform crossfades, additive layers, masks, linked-skin resolution | Implemented in TS state playback; native AnimationState API not present |
| F14 | Native pixels | Clipping implemented in C#/Godot and native conformance passes; Unity tint/alpha upload implemented; GPU acceptance and Godot color/blend parity pending |
| F24 | Exact-commit format/release gates, required jobs, complete native triggers | Implemented; regression and packaged MCP checks pass |
| F28 | Built MCP startup and worker acceptance | Executable smoke tests implemented; installed Electron and native GPU acceptance pending |
| F22 | Supported dependencies and advisory gates | Updated; verification recorded in dependency maintenance notes |
| F23 | Worker isolation, import budgets, playback bounds | Implemented; recovery retention remains pending |
| F27 | Performance | Layered atlas allocation reduced; broader profiling pending |
| F01, F25-F26 | Repository, release identity, docs | Pending |

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


## Deformation mixing verification

- ADR-0016 defines common-reference deformation crossfades, missing-channel behavior, additive layers and runtime slot masks without changing persisted formats.
- Live web meshes and software exports call the same state deformation sampler. Linked meshes resolve their timeline-sharing source before blending.
- 407 runtime-core, 163 runtime-web, and 110 render-preview tests pass, including identical-clip continuity, sparse-track pixels, outgoing alpha/masks, and scratch reuse.
- Native wrappers still expose single-clip playback; native multi-track equivalence is not claimed.


## CI integrity verification

- 58 tooling tests pass, including 16 format-gate adversarial cases and 14 release-proof cases. Missing refs, shell metacharacters, comment-spoofed constants, stale ADRs, rollbacks, wrong commits and superseded successful runs are covered.
- The packaged MCP CLI previously crashed on a dynamic CommonJS require inside ESM. Its explicit Node bridge now completes initialize and two 208-tool catalog requests outside the workspace. CI runs that executable smoke check.
- GitHub import branch verification: native conformance, full workspace tests, lint, build/workers, types and particle acceptance pass. The old blanket format gate rejected PNG preflight and a public reexport; the new gate checks their actual non-wire scope while enforcing version movement for contract changes.
- Required aggregators reject skipped jobs, include commit lint, and run native checks on every PR. Release packaging requires CI on the exact tagged main commit and reruns native conformance. Release identity/signing still require the subsequent release work.

## F22 dependency verification (September 9)

Supported dependency updates and scoped transitive security floors produce zero
known advisories (`pnpm audit`, 709 dependencies). The workspace suite passes
4,865 tests in 12 packages. All 19 type-check/build prerequisites pass; production
build, lint, boundary guards, and built video/media/Spine/MCP startup checks pass.
The MCP executable exposes 208 tools. See `../dev/dependency-maintenance.md` for
the exact toolchain, fixture drift analysis, and maintenance policy. These results
do not establish Electron desktop, native GPU, or installer acceptance.

## Resource-budget checkpoint (September 9, paused at user request)

Work in progress on `fix/audit-runtime-budgets-20260909`:

- Reject non-finite playback arguments, bound track indices and per-update loop/event work,
  and validate updates before mutating clocks. Queue transitions after multiple loops now
  wait for the next boundary and fire events from the old/new active segments.
- Move layered PSD/ORA import and sprite-atlas packing into timed workers. Add ORA
  expanded-size, entry, XML nesting, and decoded-pixel limits; PSD bitmap memory limits
  and explicit rejection of the decoder's unbounded CMYK path.
- Bound atlas file reads and aggregate source bytes/pixels; limit renderer image requests,
  serialize atlas imports, and remove temporary packed output after delivering page bytes.

The intermediate full suite passed 4,870 tests after the playback/layered changes.
The subsequent atlas-worker and shared atlas-file-store changes are a checkpoint:
full regression, built-worker startup/termination, and desktop acceptance have not yet
been rerun for those final edits. F23 remains in progress. No release or merge performed.

## Resumed resource-limit verification (September 11)

- Full workspace: 4,873 tests pass across 12 packages, including new read-budget,
  fail-fast/drain, queue-boundary, ORA expansion/nesting, and deterministic compact-page cases.
- Built atlas/layered workers import original artwork, reject oversized/corrupt inputs,
  and exit cleanly. PNG/GIF/APNG media and packaged 208-tool MCP startup checks pass.
- Atlas failures preserve typed diagnostics; concurrent reads stop and drain before cleanup.
- Small layered imports allocate 16 KiB pages instead of 64 MiB, with repeated-import
  byte equality. Details and limits are in `../dev/import-resource-limits.md`.
- Recovery retention, native GPU rendering, and interactive acceptance are still separate work.

Local September 11 checks used the available Node 24.19.0 runtime. The downloaded
24.20.0 binary could not run in this container. CI now regenerates every fixture
on the pinned toolchain and rejects byte drift as a required job; local tolerance
tests are not substituted for that gate. Full build/type checks pass (22 tasks).

## Native rendering checkpoint and export cancellation (September 11)

- PR #42 implements native clipping with atlas UV interpolation and current draw-order end
  boundaries. Godot tests include concave intersections, fully clipped output, and reused buffers.
  Both CI and native conformance pass for commit b66c2c3e0e897e9be9b934a92027185abc383bd9.
- Unity forwards dark tint and explicit atlas alpha policy, configures separate RGB/alpha blend
  factors, recalculates mesh bounds, supports larger index buffers, and releases owned resources.
  The Unity-specific uploader/shader is not compiled by the headless C# suite. Engine pixel
  verification remains required. Godot dark tint/PMA/screen parity is still pending.
- Media cancellation drains active writes and awaits worker termination before cleanup. Cancellation
  after a native dialog returns is checked before starting work. Single-file cancellation remains
  effective through staging; once atomic commit begins, cancellation correctly reports false.
- Project reads allocate only the checked size and reject growth/truncation, closing the gap between
  checking file size and an unbounded `readFile()` call. Existing project assets still round-trip.
- Focused regression: 22 tests pass across worker lifecycle, native-dialog cancellation, file commit,
  bounded reads, portable project assets, and media encoding. These are automated host-seam checks;
  actual installed Electron dialog and GPU acceptance are not claimed.
