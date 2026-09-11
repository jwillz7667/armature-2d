# Dependency maintenance

The September 9, 2026 remediation uses Node 24.20.0 and pnpm 11.19.0, Electron
44.3.0, electron-builder 26.15.3, electron-vite 5.0.0, Vite 7.3.6, Vitest
4.1.11, ESLint 10.10.0, boundaries 7.2.0, and MCP SDK 1.30.0. React remains
on its existing major. The electron-vite peer range determines the Vite major;
updating unrelated packages to their latest major is not a security policy.

Run `pnpm install --frozen-lockfile` and `pnpm audit:dependencies`. Both ordinary
CI and the release gate reject advisories at low severity or higher. An audit
is a dated registry result, not proof that code has no vulnerabilities. The
September 9 audit reported zero known advisories across 709 dependencies.

`pnpm-workspace.yaml` contains narrowly scoped overrides for vulnerable
transitive versions. Each override stays within its dependency's existing
major (and minor for the affected pre-1.0 XML parser). Remove an override when
its upstream parent resolves to a patched version without it, then rerun the
audit, full suite, type checks, production build, and packaged worker checks.
Do not suppress advisories or broadly override unrelated major versions.

Only Electron and esbuild install scripts are enabled. The unused Squirrel
Windows installer script is disabled; release configuration uses NSIS.
Electron 44.3.0 has an exact release-age exception for this security update;
the general minimum-age policy remains enabled.

The ESLint boundaries migration retains the original allowed dependency edges
and default-deny policy. Lint guard tests exercise prohibited imports. Vitest
uses at most two workers per package and the workspace test runner schedules
three packages at a time to avoid multiplying worker pools across the monorepo.

## Fixture toolchain transition

All four conformance generators were run on the exact pinned Node 24.20.0
binary, verified against the official distribution's SHA-256 manifest. A second
run produced identical bytes across all 51 fixture and expected-output files.
Beyond toolchain provenance and lock hashes, only 15 floating-point values in
three skeletal fixtures changed. Maximum absolute differences were:

| Fixture | Values | Maximum absolute difference |
| --- | ---: | ---: |
| rig-ik-depth | 3 | 7.105427357601002e-15 |
| rig-physics-pendulum | 10 | 1.1102230246251565e-16 |
| rig-transform-variants | 2 | 1.1102230246251565e-16 |

These are numerical toolchain differences; no document format version changes.
Review this transition under the fixture behavior-change/CODEOWNERS policy.
Native conformance remains a required independent CI check. Desktop launch,
GPU rendering, and installer acceptance require their own verification; a
successful JavaScript build does not establish those results.
