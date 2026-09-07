# Audit remediation, 7 September 2026

Owner directive: fix all gaps identified in the repository audit of main at
46d367b4e5fe07f74cc64e376580ad21de16cb09. Preserve the command, format and deterministic
presentation boundaries. Work proceeds in verified subsystem changes.

## Status

| Findings | Work | State |
|---|---|---|
| F06, F07 | Mesh command safety and complete animation duration bounds | Implemented, 2,290 document-core tests pass; published in command-safety PR |
| F21 | Filesystem link confinement and bounded file I/O | Implementation and tests in progress |
| F02-F05, F09 | Project persistence, asset history, recovery, document identity | Next |
| F08, F10-F13, F15 | Displayed pose, video startup, physics/export/native skin context | Pending |
| F16-F20, F29 | Import capability, constraint/effect/slot UI, MCP, deform policy | Pending |
| F01, F22-F28 | Repository, dependencies, CI, release, docs, performance, acceptance | Pending |

## Evidence and environment

- Command change: local f5b2380; GitHub 4a9bfbd69a19da89dcfb9786d74cbf800cdf8148.
- Node 24.19.0 and pnpm 11.19.0 locally; CI uses repository pins.
- No interactive desktop/native-engine verification has been claimed.
- Git transport has read access but no push credential. Repository writes use the connected GitHub API.
- Signing identities and actual Windows/macOS/Unity device acceptance must be checked before a release.

Update this ledger with actual implementation and verification. Do not mark a gap complete merely
because an unsupported-feature label or a plan exists.
