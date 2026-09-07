# Changelog

## Unreleased

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
