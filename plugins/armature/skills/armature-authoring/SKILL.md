---
name: armature-authoring
description: Create, edit, validate and render Armature 2D skeletons using its connected MCP tools. Use for Armature rigging and skeletal animation workflows.
---

# Armature authoring

Use the connected Armature MCP server and its live tool schemas. It exposes the
same command/history system as the editor, but operates on separate headless sessions.

If Armature tools are unavailable, explain that the local engine needs configuration.
Use the plugin's README setup instructions when a local Node environment is available.
Do not claim that installing this skill establishes a hosted connection or controls
an editor window. Do not change the client's tool approvals to make a call succeed.

For a new rig, use `document.new`, create bones, add slots and attachments, then author
animations with the corresponding tools. Use returned document/bone/slot identifiers.
For existing work, use `document.open` with a skeleton JSON inside the configured project
folder. Inspect the snapshot and tool schemas before modifying unfamiliar structures.

Use `history.undo` and `history.redo` for revisions. Bracket related interactive changes
with beginInteraction/endInteraction when one undo step is appropriate. Validate before
saving. Render with `render_frame`, decode the PNG and inspect the image when visual
quality matters. Check the `placeholders` flag and use explicit seeds for effect previews.

`document.save` persists skeleton JSON, not a complete effects/slot editor project.
Save before ending the server process. Reopen saved output to verify persistence when
it is part of the requested deliverable. Keep output paths inside the selected folder.
A path-confinement error is not an invitation to widen that folder's access.

Report actual artifacts and checks performed. Distinguish a valid PNG from animation
quality, CPU previews from GPU parity, and headless sessions from live editor control.
