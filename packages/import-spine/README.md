# @marionette/import-spine

Import-only clean-room conversion of user-owned exports into validated Armature documents.
No path exports Spine JSON or binary. No Spine runtime or editor source may be consulted.
Only this package's public barrel is consumed by the editor and MCP server; it imports no
other repository package except `@marionette/format`.

## Compatibility and evidence

A validated Armature document does not establish reproduction of the source animation.
The previous major-version-only gate and JSON/binary equivalence claim were too broad.

| Input | Accepted profile | Evidence | Release behavior |
|---|---|---|---|
| JSON 4.0.x | Explicit minor, release-version syntax | Shared documented-shape converter; synthetic cases | Convert supported fields and report losses |
| JSON 4.1.x | Explicit minor, release-version syntax | Synthetic fixtures labeled 4.1.24; no actual-export corpus | Convert supported fields and report losses |
| JSON 4.2.x | Explicit minor, release-version syntax | Synthetic fixtures labeled 4.2.33; no actual-export corpus | Convert supported fields and report losses |
| Other JSON minors, beta/malformed versions | None | No tested decoder | `SPINE_VERSION_UNSUPPORTED` |
| Real `.skel` exports | None verified | Existing tests generate synthetic bytes | `SPINE_BINARY_UNVERIFIED`; export JSON instead |
| Development binary codec | Explicit `allowUnverifiedBinary: true` | Primitive/layout synthetic tests only | Not exposed by the editor or MCP tool |

This matrix distinguishes candidate JSON conversion from verified source-application fidelity.
Before enabling a real binary profile, obtain permitted user-owned exports from the exact
minor, retain their provenance and corresponding JSON, and compare geometry, timelines, and
rendered frames against the user's source output. Do not infer binary layout from a version
string or synthetic encoder/decoder agreement.

## API

```ts
importSpineJson(input, { name: 'hero' });
// { ok: true, document, warnings } or { ok: false, errors, warnings }
```

Input is a parsed JSON tree. Conversion is deterministic and returns typed diagnostics with
JSON Pointer paths and optional structured details. Cycles, reserved object keys, excessive
nesting/value counts, malformed fields, and invalid output references fail conversion.

`importSpineSkel(bytes)` returns the explicit unverified-binary error. The development opt-in
exists for maintaining the quarantined synthetic decoder and is not a compatibility promise.

## Feature behavior

| Feature | Behavior |
|---|---|
| Bones, slots, skin-scoped content, regions, meshes, linked meshes | Convert documented fields; output validator checks references |
| IK, transform, path constraints and documented joint timelines | Convert supported layouts; unknown setup/timeline fields receive source-path notices |
| Light/dark tint and event definitions | Convert; synthesize setup dark color with a notice when needed |
| Draw-order timelines | Reconstruct explicit destinations, retain relative setup order for unspecified slots, preserve setup resets and duration |
| Curves | Documented linear/stepped/normalized Bezier encodings; unsupported array shapes fail |
| Static animations | Represent zero duration as one authoring frame, with a notice |
| Deform timelines | Omit with a coordinate-space notice: Spine deforms are local before skinning; Armature deforms are world offsets after skinning. Old zero-padding/truncation could silently change motion |
| Physics, attachment sequences, unknown timeline families | Explicit loss notices |
| Per-key event audio overrides, weighted clipping/bounding polygons | Explicit loss notices |
| Atlas in the pure API / MCP | Placeholders with a notice; no filesystem access |
| Atlas in the editor | Read sibling `<export-name>.atlas` and PNG pages, normalize quarter-turn rotation and trim offsets, repack deterministically, validate attachment paths, install document and pixels together |

The editor shows conversion notices before installation and retains structured details in a
report that can be saved as JSON. Missing descriptors can be imported as data-only after the
notice; a present but unreadable, unsafe, or inconsistent atlas fails the transaction. Existing
work remains in place when conversion, asset preparation, or unsaved-work confirmation fails.

## Resource and asset boundary

The editor imports in a worker with a 60-second deadline and bounded heap. Source JSON is
limited to 64 MiB; atlas descriptors to 4 MiB; PNG files to 256 MiB each and 512 MiB aggregate.
PNG dimensions are checked before decoding (16384 per axis, 64 million aggregate pixels).
Descriptor paths may name only regular unlinked sibling files. Linux reads are anchored to a
held directory descriptor; other hosts verify directory identity but are not an OS sandbox.

Atlas metadata outside the renderer contract receives notices. PMA pages normalize to straight
alpha with a rounding notice. Indexed duplicate region names are rejected until they have unique
exported paths. This import path does not implement nine-patch layout or attachment sequences.

## Clean-room sources and tests

Consulted public references: [JSON export format](https://esotericsoftware.com/spine-json-format),
[binary export format](https://esotericsoftware.com/spine-binary-format), and
[atlas export format](https://esotericsoftware.com/spine-atlas-format). These describe data;
no linked runtime/editor source was opened. All committed new cases are original synthetic data.

Run `pnpm --filter @marionette/import-spine test` for conversion and negative tests. Editor
asset tests cover asymmetric rotated pixels, whitespace, complete sibling import, missing files,
traversal, links, and byte limits. `node tools/smoke-spine-worker.mjs` runs the built worker after
the editor build. Real-export fidelity and installed Electron interaction remain acceptance gates.
