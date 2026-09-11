# ADR-0015: Editable project envelope and atomic persistence

Status: Accepted for audit remediation, 2026-09-07.

The desktop Save action previously exported only a SkeletonDocument. Effects, slot scene authoring
and recoverable asset history were lost when the document was reopened. Updating a JSON file and its
texture directory independently could also leave a partially saved project.

## Decision

The editor saves a self-contained `.armature.json` ProjectDocument with an independent
`projectFormatVersion` of `0.1.0`. It contains the current skeleton, effects and slot scene envelopes,
their hashes, and namespaced, base64-encoded texture assets with individual SHA-256 hashes. The whole
container carries the existing canonical content hash. Unknown project versions fail explicitly.

An editable project's skeleton may have zero bones; standalone SkeletonDocument and MRNT exports still
require at least one. All other skeletal structure and semantic checks remain in force. Effects use
their full validator. The slot envelope validates structure, version and hash; external scene references
remain host-resolved and must pass the slot runtime's resolver validation before runtime use.

Legacy skeleton JSON opens through the existing migrations and hash checks. It receives an empty
effects library and the default slot scene. Its first project Save uses Save As, preserving the original
runtime file. Legacy sidecar texture failures are shown to the author. Missing required texture bytes
block project saving rather than silently producing an incomplete project.

The main process validates before disk mutation, flushes a same-directory temporary file, and atomically
renames it into place. The prior project is retained as `.bak`. Save remembers only destinations obtained
from native dialogs, indexed by an opaque document-session UUID. Save As always asks for a destination.
All save, recovery and discard operations share a queue. Recovery writes happen every 15 seconds when
the project is dirty and no gesture is active; File > Recover Unsaved Project opens those copies.

## Document and asset ownership

Every replacement has a new session identity and explicitly resets selection, playback and render
caches. Async saves acknowledge only the captured session and snapshot, leaving newer edits dirty.
Save seals history coalescing so Undo can reach the saved state. New, Open, replacement imports and
Close offer Save / Discard / Cancel; errors are visible in Problems.

Sprite import validates and decodes before committing metadata. Page names incorporate their content
hash. Matching region names update while unrelated sprites remain available. The asset store retains
immutable bytes for Undo and disposes inactive GPU resources. Undo re-decodes those bytes; stale decode
completions cannot publish into a replacement project. Pixel memory is limited to 64 megapixels per
atlas preparation; retained byte history is limited to 512 MiB per atlas store. The author can save and
reopen to start a fresh history if this explicit limit is reached.

## Compatibility and verification

Skeleton `0.6.0`, effects `1.0.0`, slot scene `0.1.0`, and MRNT bytes are unchanged. Project containers
are editor documents, not an additional runtime interchange promise. Export remains the runtime seam.

Regression tests cover all existing skeletal seeds, non-default effects/slot content, empty projects,
asset integrity, interrupted atomic replacement, dirty savepoints, save completion races, replacement
identity, retained Undo pixels and rejected untrusted IPC frames. Desktop lifecycle and native engine
acceptance still require the platform CI jobs; unit tests are not evidence of installed-app behavior.
