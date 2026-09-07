# Changelog

## Audit: import integrity and image budgets

- Gate unknown JSON minors and unverified binary layouts; preserve structured conversion reports.
- Import sibling Spine atlas/PNG assets in a bounded worker, with deterministic rotation/trim normalization.
- Preserve draw-order timelines and report incompatible deform coordinate spaces instead of silently changing motion.
- Preflight PNG dimensions before decoding and fail media exports when supplied texture pages cannot decode.


## Audit slot composer

- Add full grid, symbol, win-step, flow-graph, and tumble controls with typed recorded-result previews.
- Render project artwork, effects, and cinematics; preserve internal reference hashes on save.
- Honor cascade phase timings, refill staggering, banner placement, and final counter completion.
- Fix win-step reorder redo, replaced symbol references, and premature scheduled sprites.


## Audit effects designer

- Add full layer parameters, lifetime-curve graphs and easing, bundle editing, textured previews, seeded restarts, and moving anchors.
- Keep particle trails and their curves atomic; fix duplicate reorder entries, duplicate bundle names, and bundle edit coalescing.
- Add MCP particle-trail editing and default effect blending controls.


## Audit constraint authoring

- Add GUI creation for IK, transform, and editable path followers with target handles and complete parameter controls.
- Add constraint timeline editing, IK depth keys, curve replacement, key navigation/deletion, and MCP options.
- Roll back completed children when a compound command fails validation.

## Audit authoring feedback

- Add constrained pose and weighted/linked-mesh sampling with revision, skin, time, and physics context.
- Expose complete deform and IK-depth inspection and in-place deform-curve commands with undo.
- Generate the 204-tool reference and exact input schemas from the MCP registry.

## Unreleased

- Remove Node-only PNG codecs from the browser video worker. Bound encoder queues, handle startup
  failures, and terminate canceled exports. Render GIF/APNG/PNG sequences in a background worker with
  frame-write acknowledgments and atomic output publication.
- Forward the active skin and physics clock through playback and rendered exports. Warm ranged physics
  exports from the beginning, replay absolute player seeks, and use the displayed pose for selection.
- Add built-worker startup and export smoke gates to CI.

- Save complete editor projects, including effects, slot scenes and texture pixels, in versioned
  `.armature.json` containers. Continue opening legacy skeleton JSON through its migration path.
- Add atomic saves, previous-file backups, Save As, dirty-state prompts, recovery copies and visible
  file/import error messages.
- Preserve texture bytes across Undo, merge image imports without dropping unrelated sprites, and
  cancel stale async work when the document changes.
- Reject weighted mesh coordinate edits and invalid animation duration changes before mutation.
- Confine MCP file access against linked paths, bound reads and atomically replace written files.
- Restrict Electron IPC to the application top frame; deny unsolicited navigation, windows, webviews
  and permission requests.
