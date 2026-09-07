# Changelog

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
