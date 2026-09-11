# CI and format change gates

Every pull request reports both `ci-pass` and `conformance-native-pass`. Every dependency of these
checks must finish successfully. Skipped, missing, cancelled or failed jobs fail the aggregate.
Commit lint is included; its PR-specific step is omitted on main pushes, while the job still runs.
Both native runtimes must exist. Native conformance runs on all PRs, main pushes, nightly, and as a
reusable release workflow. Repository rules must require both checks; workflow files cannot configure
repository rules or the default branch.

The format gate reads exact base and head commits from the pull-request or push event. In particular,
main pushes compare `before` to `after`, not main to itself. A missing ref, malformed constant, deleted
version line or unavailable CI comparison fails. Git arguments use execFile without a shell. Locally,
`node tools/check-format-semver.mjs --base <commit>` compares with HEAD; the default is HEAD^ to HEAD.

The gate compares parsed constant values for skeleton, effects, slot scene, shared primitives and
editable projects independently. Touching the constants file or putting a fake declaration in a comment
cannot substitute for a version change. Formatting/comments and pure reexport barrels do not change the
wire contract. PNG preflight in `assets/png.ts` is an allocation boundary, not a serialized format.
Other implementation changes are conservatively classified as contract changes; review must assess
behavioral compatibility, including changes outside the format package.

For a contract change, include a JSON array in `docs/format-changes/<change>.json` with:

- `constant`, `from`, `to`, `classification` (`new`, `patch`, `minor`, `major`), and a concrete `reason`.
- `adr`: a changed ADR that names the new version.
- `tests`: changed format regression tests; editable project integration tests may live in document-core.
- `migration`: changed migration implementation when the breaking digit advances (MINOR before 1.0).

Version movement must match the classification and never go backwards. Existing unrelated ADRs cannot
satisfy a new transition. These checks ensure review evidence exists; the regression suite proves behavior,
and a reviewer still needs to assess migration completeness and the declared classification.

Release checks require matching tag/root/app versions, main ancestry, and the latest successful main-push
CI and native-conformance runs on the exact tagged commit. A green run on another commit, a PR event,
or a superseded success cannot satisfy this. Releases rerun local checks, worker/MCP executable smoke
tests, particle acceptance and native conformance before packaging. Draft releases remain unpublished.

The built MCP smoke test launches the bundled executable outside the workspace, performs initialize and
initialized messages, and reads the full tool catalog twice. This catches ESM/CommonJS startup failures
that a source-level server test cannot detect.

References: [GitHub job dependencies](https://docs.github.com/actions/using-jobs/using-jobs-in-a-workflow),
[required checks and skipped workflows](https://docs.github.com/actions/managing-workflow-runs/skipping-workflow-runs),
[workflow run filters](https://docs.github.com/en/rest/actions/workflow-runs).
