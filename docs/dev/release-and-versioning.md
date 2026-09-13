# Release and Versioning

How versions work in this repository, what gates a change, and where the release pipeline stands.

## The version lines (they are independent)

| Line | Where | Current | Policy |
|---|---|---|---|
| Skeleton format (`formatVersion`) | `packages/format/src/version/constants.ts` | `0.6.0` | `format-contract.md` section 10 |
| Effects format (`effectsFormatVersion`) | same file | `1.0.0` | same document |
| Slot-scene format | same file | `0.1.0` | same document |
| Shared format primitives | same file | `1.0.0` | frozen; a change here is a MAJOR event |
| Boundary contract (math engine) | `packages/math-bridge/src/version.ts` | `1.0.0` | additive changes only without a bump |
| MRNT container version | `packages/format/src/binary/` | `1` | new container features bump it |
| App version | root and editor `package.json` | `0.2.0-rc.1` | matches the release tag |

The format version is the semver of THE FORMAT, deliberately independent of the app version: a
document written today must load in every future app version that supports its MAJOR (with
migrations), regardless of app release cadence.

## Changing the format (the expensive thing, LAW 3)

1. Classify the change MAJOR/MINOR/PATCH per `docs/plan/cross-cutting/format-contract.md`
   section 10. Pre-1.0, a breaking skeleton-format change bumps MINOR.
2. Bump the right constant in `version/constants.ts`, write the migration step in
   `src/version/migrations/`, test it (the registry holds `0.1.x -> 0.2.0`, `0.2.x -> 0.3.0`,
   `0.3.x -> 0.4.0`, `0.4.x -> 0.5.0`, and `0.5.x -> 0.6.0` as the pattern to follow), and add a
   `CHANGELOG.md` entry in the format package.
3. Formatting/comments and public reexports do not change the serialized format. Implementation changes require compatibility review; the gate conservatively requires a classified transition.
4. CI compares exact commits and actual version values, and requires changed classification, ADR, regression and migration evidence. See [CI and format gates](ci-and-format-gates.md).

Stage F4 concludes the F1 to F4 format staging of `docs/plan/pro-parity-execution-plan.md`: 0.6.0
(physics constraints, the optional skeleton physics settings block, and the per-animation physics
timeline) landed with ADR-0014, so all four planned format bumps are now in. 0.5.0 (path attachments,
path constraints, and the per-animation path timeline) landed with ADR-0011; 0.4.0 (constraint depth,
linked meshes, sequences, per-component curves, two-color tint, skin-scoped bones/constraints) landed
with ADR-0009; 0.3.0 (events, draw-order timelines, metadata) landed with ADR-0008. No further format
change is planned; the next format bump would be a new capability with its own ADR and migration.

## Changing solve behavior

Any change that alters numeric output of the per-frame solve, the effects simulation, or the slot
sequencer requires regenerating the affected conformance fixtures on the pinned Node (24.20.0) in
the same PR, under the `behavior-change` label with CODEOWNERS review on `fixtures/**` and an ADR
or CHANGELOG entry. Drift without regeneration fails CI by design.

## Toolchain pins

- Node `24.20.0` (`.node-version`): the fixture-generation toolchain. Bumping it is a deliberate
  act that regenerates every byte-locked artifact (fixtures, lock manifests, golden PNGs) in one
  reviewed PR.
- pnpm `11.19.0` (`packageManager`): bump together with a green `pnpm ci:local` and lockfile diff
  review.
- Dependency policy: exact pins for load-bearing runtime deps (`zod`, `@noble/hashes`,
  `pixi.js 8.19.0`), caret ranges elsewhere, `--frozen-lockfile` in CI, weekly audit review.

## Commit and branch conventions

Conventional Commits enforced by commitlint in CI (`feat:`, `fix:`, `refactor:`, `perf:`,
`test:`, `docs:`, `chore:`, `build:`, `ci:`; imperative subject <= 72 chars; body explains why).
One logical change per commit; a refactor and a behavior change never share one. Branches:
`feat/<slug>`, `fix/<ticket>-<slug>`; one subsystem per branch; a phase branch does not open until
its predecessor milestone is green (LAW 5).

## The release pipeline (status: built, unsigned first release)

Phase 5 WP-5.7 / PP-E5 owns it. It is now built with electron-builder; the configuration lives in
`apps/editor/electron-builder.yml` and two scripts drive it:

- `pnpm --filter editor package` runs `electron-vite build` then `electron-builder --dir` and
  produces an UNPACKED app for the host platform (fast local smoke check, no installer).
- `pnpm --filter editor package:dist` runs `electron-vite build` then `electron-builder` and
  produces the platform installers.

Artifacts per operating system (all x64 unless noted; the mac targets ship as separate per-arch
artifacts, NOT a universal binary):

| OS | Artifacts |
|---|---|
| macOS | `.dmg` and `.zip` for arm64 AND x64 (four files) |
| Windows | NSIS `.exe` installer (x64) |
| Linux | `.AppImage`, `.deb`, and `.rpm` (x64) |

App identity: appId `com.viralventures.armature2d`, productName "Armature 2D". The mac icon comes
from `apps/editor/build/icon.icns`, Windows and Linux from `apps/editor/build/icon.png` (512 px;
electron-builder generates the Windows `.ico` from it at package time, so no `.ico` is committed and
no extra dependency is added). The runtime app icon the main process loads at
`process.resourcesPath/icon.png` (see `src/main/main.ts`) is carried as an `extraResources` copy of
`apps/editor/resources/icon.png`.

The tag-triggered workflow is `.github/workflows/release.yml`: on a `v*` tag it runs the full local
gate inline (`pnpm ci:local`, the `ci-pass` set) because a tag push carries no PR context, then
packages on a `macos-latest` / `windows-latest` / `ubuntu-latest` matrix and uploads each OS's
installers to the tag's draft GitHub Release. Tag only a commit already merged green on `main`
(where `ci-pass` and `conformance-native-pass` ran); the inline gate is the release-time backstop.

Deliberately not built yet (recorded, not hidden): code signing, notarization, and auto-update. The
first release ships UNSIGNED and updateless. The workflow already contains signing and notarization
steps that are gated on their secrets existing and skip cleanly when absent; the exact secret names
to configure later are listed in the workflow header (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`). No publish
or update provider is configured (`publish: null`): consistent with the local-only privacy
directive, the packaged app makes no network request, and auto-update, when it lands, will be
strictly opt-in and integrity-checked.

The two-edition split (Essentials/Pro) is superseded by the free-product directive
(`docs/plan/pro-parity-execution-plan.md` section 1); no edition gating or licensing exists in code,
deliberately.

## Definition of a shippable build (Phase 5 exit)

One full game authored in Armature 2D, exported, and played back with conformance parity on web
and Unity, from a signed build produced by the release pipeline. Until then, every merge to `main`
keeps the headless acceptance harnesses green so the eventual release is an artifact of routine,
not a heroic integration.


## Publishing a version request

Update the root/editor versions, add `docs/releases/<version>.md`, and update
`.github/release-request.json` in one reviewed PR. Merging the request to main starts the release
workflow. It waits for CI and native conformance on that exact main commit before creating its
immutable version tag, then runs the full release gate and all platform package builds. Manual
version-tag pushes remain supported and require the same exact-main-commit evidence.

After every platform succeeds, the workflow verifies that the complete installer set is present,
uploads SHA256SUMS, and publishes the release. Versions with a semver suffix are published as
prereleases and do not become the latest stable release. A failed gate or package build leaves
any existing draft unpublished. Rerunning the same workflow requires the tag to still point to the
same commit; tags are never moved to repair a release.
