# MCP tool reference

Generated from the live registry. Run `pnpm --filter @marionette/mcp-server reference` to update.

204 tools. All inputs are validated before execution. Document mutations use command history.
The machine-readable companion is `mcp-tools.json`. The artist UI exposes its own documented subset.

## anim.create

Create a new, empty animation with a duration and return its id.

Inputs: `documentId`, `name`, `duration`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 0.

## anim.delete

Delete an animation and all its timelines (one undo step).

Inputs: `documentId`, `animationId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 1.

## anim.duplicate

Duplicate an animation under a new name and return the new id (one undo step).

Inputs: `documentId`, `animationId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 2.

## anim.duration

Set an animation duration (seconds). Rejects shrinking below the last keyframe time as ANIMATION_DURATION.

Inputs: `documentId`, `animationId`, `duration`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 3.

## anim.get

Get one animation with all its timelines and keyframes by id.

Inputs: `documentId`, `animationId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 4.

## anim.list

List the animations (id, name, duration, track counts).

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 5.

## anim.rename

Rename an animation (identity is the id, so timelines are unaffected).

Inputs: `documentId`, `animationId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 6.

## anim.sequence.delete

Delete a slot frame-sequence keyframe (by id). A missing key is a typed KEYFRAME_NOT_FOUND.

Inputs: `documentId`, `animationId`, `slotId`, `keyframeId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 7.

## anim.sequence.move

Move a slot frame-sequence keyframe (by id) to a new time (strict-ascending). Landing on an occupied time is a typed KEYFRAME_COLLISION; a missing key is a typed KEYFRAME_NOT_FOUND.

Inputs: `documentId`, `animationId`, `slotId`, `keyframeId`, `time`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 8.

## anim.sequence.set

Insert or update a slot frame-sequence keyframe at a time (Stage F2): `mode` playback, starting `index`, and `delay` seconds per frame. Updating an existing time keeps its id. The timeline stays strict-ascending in time.

Inputs: `documentId`, `animationId`, `slotId`, `time`, `mode`, `index`, `delay`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 9.

## atlas.get

Return the document current atlas ref (packed pages + regions).

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 10.

## atlas.pack

Pack the source PNGs in a project directory into a deterministic atlas (import -> alpha-trim -> maxrects pack -> emit, ADR-0007) and install it through the command history (LAW 2). `sourceDir` and `outputDir` are project-relative and confined to the project root; page PNGs are written under `outputDir` and the returned AtlasRef records each page path project-relative so render_frame can read it back. Region names are the source file base names; region/mesh attachment `path` resolves against them.

Inputs: `documentId`, `sourceDir`, `outputDir`, `maxPageSize`, `padding`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 11.

## atlas.set

Install the document atlas (packed pages + regions) through the command history (LAW 2). The editor atlas-pack pipeline produces the AtlasRef; this is the only legal path that sets it. Region/mesh attachment `path` references resolve against the region names installed here.

Inputs: `documentId`, `atlas`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 12.

## attach.linkedmesh.create

Add a linked mesh (Stage F2) to a slot default skin: it reuses the geometry of a PARENT mesh on the SAME slot (in `skin`, default the default skin) while carrying its own atlas `path`, size, and color. `timelines` shares the parent deform timelines. The parent chain is resolved and cycle-checked (LINKED_MESH with reason parentMissing / parentInvalid / cycle / duplicateName).

Inputs: `documentId`, `slotId`, `name`, `path`, `parent`, `skin`, `timelines`, `width`, `height`, `color`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 13.

## attach.linkedmesh.unlink

Bake a linked mesh to a plain mesh: it takes the resolved root geometry and keeps its own atlas path, size, and color. A target that is not a linked mesh is LINKED_MESH with reason notFound.

Inputs: `documentId`, `slotId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 14.

## attach.path.add

Add a path attachment (a cubic Bezier rail) to a slot. Omitting `vertices` lays down the default two-curve open path. `vertices` is the flat [x0,y0,x1,y1,...] control-point stream; the arc-length table is computed from it. A path renders no pixels (no atlas region).

Inputs: `documentId`, `slotId`, `name`, `closed`, `constantSpeed`, `vertices`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 15.

## attach.region.add

Add a region attachment to a slot. `path` references an atlas region; width/height/offset are caller-supplied (derived from the region by the editor).

Inputs: `documentId`, `slotId`, `name`, `path`, `x`, `y`, `rotation`, `scaleX`, `scaleY`, `width`, `height`, `color`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 16.

## attach.region.transform

Set a region attachment placement/size. Omitted fields keep their current value.

Inputs: `documentId`, `slotId`, `name`, `x`, `y`, `rotation`, `scaleX`, `scaleY`, `width`, `height`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 17.

## attach.remove

Remove an attachment from a slot (clears the slot active attachment if it was it).

Inputs: `documentId`, `slotId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 18.

## attach.sequence.set

Set or clear the Stage F2 frame-sequence on a region or mesh attachment. Provide `sequence` (count >= 1, non-negative integer start/digits/setupIndex, setupIndex in [0, count)) to set it, or `sequence: null` to clear it. A bad shape/setupIndex or a non-region/mesh target is SEQUENCE (reason shape / setupRange / notFound).

Inputs: `documentId`, `slotId`, `name`, `sequence`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 19.

## bone.create

Create a bone (optionally parented) and return its id.

Inputs: `documentId`, `parentId`, `name`, `x`, `y`, `rotation`, `length`, `scaleX`, `scaleY`, `shearX`, `shearY`, `transformMode`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 20.

## bone.delete

Delete a bone and its descendant bones (one undo step).

Inputs: `documentId`, `boneId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 21.

## bone.get

Get one bone by id.

Inputs: `documentId`, `boneId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 22.

## bone.list

List the bones in document order.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 23.

## bone.move

Set a bone local translation (x, y).

Inputs: `documentId`, `boneId`, `x`, `y`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 24.

## bone.rename

Rename a bone (identity is the id, so references are unaffected).

Inputs: `documentId`, `boneId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 25.

## bone.reparent

Move a bone under a new parent (null for a root), holding its world transform fixed. Rejects a cycle (reparenting under itself or a descendant) as REPARENT_CYCLE.

Inputs: `documentId`, `boneId`, `newParentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 26.

## bone.rotate

Set a bone local rotation in degrees.

Inputs: `documentId`, `boneId`, `rotation`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 27.

## bone.scale

Set a bone local scale (scaleX, scaleY).

Inputs: `documentId`, `boneId`, `scaleX`, `scaleY`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 28.

## bone.setLength

Set a bone length.

Inputs: `documentId`, `boneId`, `length`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 29.

## bone.shear

Set a bone local shear in degrees (shearX, shearY).

Inputs: `documentId`, `boneId`, `shearX`, `shearY`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 30.

## bone.transformMode

Set how a bone inherits its parent transform (the format TransformMode enum).

Inputs: `documentId`, `boneId`, `mode`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 31.

## bundle.create

Create a new, empty, named effect bundle.

Inputs: `documentId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 32.

## bundle.delete

Delete a named bundle and all its items (one undo step).

Inputs: `documentId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 33.

## bundle.get

Get one bundle with all its items by name.

Inputs: `documentId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 34.

## bundle.item.add

Append an item (a referenced effect + startOffset + anchorRole + seedSalt) to a bundle. The referenced effect must exist (EFFECT_EDIT bundleEffectMissing).

Inputs: `documentId`, `name`, `item`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 35.

## bundle.item.remove

Remove an item from a bundle by its item id.

Inputs: `documentId`, `name`, `itemId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 36.

## bundle.item.reorder

Reorder a bundle items by an explicit ordered item-id list (a permutation).

Inputs: `documentId`, `name`, `order`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 37.

## bundle.item.set

Patch a bundle item fields (effect / startOffset / anchorRole / seedSalt). Only the provided fields change; a new effect reference must exist.

Inputs: `documentId`, `name`, `itemId`, `effect`, `startOffset`, `anchorRole`, `seedSalt`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 38.

## bundle.list

List the effect bundles (name, item count) in bundle order.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 39.

## constraints.reorder

Set the explicit cross-array constraint solve order (ADR-0009/ADR-0011): `order` is the combined IK-then-transform-then-path constraint ids in the desired solve order, a dense unique cover of the current set (a wrong length, duplicate, or unknown id is CONSTRAINT with reason orderInvalid). Pass `order: null` to CLEAR the explicit order and restore the default (all IK, then transform, then path).

Inputs: `documentId`, `order`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 40.

## deform.clearAttachment

Remove every deform keyframe for one (slot, attachment) across all animations and all skins (one undo step). The prerequisite for re-topologizing a deformed mesh.

Inputs: `documentId`, `slotId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 41.

## deform.deleteKeyframe

Delete a deform keyframe (by id) from a (skin, slot, attachment) mesh channel. `skin` is "default" or a named SkinId.

Inputs: `documentId`, `animationId`, `skin`, `slotId`, `name`, `keyframeId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 42.

## deform.moveKeyframe

Move a deform keyframe (by id) to a new time on its (skin, slot, attachment) channel. `skin` is "default" or a named SkinId. Rejects landing on an occupied time as KEYFRAME_COLLISION.

Inputs: `documentId`, `animationId`, `skin`, `slotId`, `name`, `keyframeId`, `time`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 43.

## deform.setCurve

Set the outgoing interpolation curve (linear / stepped / bezier) of an EXISTING deform keyframe by id, keeping its time and offsets. The in-place complement to deform.setKeyframe (whose update path keeps the old curve); kf.curve covers only bone/slot channels. `skin` is "default" or a named SkinId.

Inputs: `documentId`, `animationId`, `skin`, `slotId`, `name`, `keyframeId`, `curve`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 44.

## deform.setKeyframe

Insert or update a deform keyframe at a time on a (skin, slot, attachment) mesh channel. `skin` is "default" or a named SkinId. `offsets` is the flat per-LOGICAL-vertex [dx, dy, ...] array and its length must equal the mesh uvs length. Updating an existing time keeps its curve; a new keyframe takes the optional insert `curve` (default linear). Rejected as DEFORM (reason notMesh or offsetLength).

Inputs: `documentId`, `animationId`, `skin`, `slotId`, `name`, `time`, `offsets`, `curve`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 45.

## document.close

Discard an open document session.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 46.

## document.export

Project the document to the portable format JSON (validated and hashed).

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 47.

## document.getSnapshot

Return the internal snapshot (bones, order) of an open document.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 48.

## document.getWorldTransforms

Read bone matrices from setup or a fully constrained animated pose. Physics is replayed from rest at 60 Hz; times clamp to the clip duration. Returns revision and resolved context.

Inputs: `documentId`, `animationId`, `time`, `skin`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 49.

## document.new

Create a new, empty skeleton document and return its id.

Inputs: `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 50.

## document.open

Read and validate a document from a path, returning a new document id.

Inputs: `path`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 51.

## document.save

Export the document and write it to a path through the host file store.

Inputs: `documentId`, `path`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 52.

## document.setMetadata

Set the optional skeleton metadata block (authoring fps and the project-relative imagesPath / audioPath source directories). Replaced wholesale; when every field is absent the block is cleared. Drives the Stage F1 command on the shared History (LAW 2).

Inputs: `documentId`, `fps`, `imagesPath`, `audioPath`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 53.

## document.validate

Validate the current document against the format. Returns ok plus any errors.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 54.

## draworder.key.delete

Delete a draw-order key (by id) from an animation. A missing key is a typed KEYFRAME_NOT_FOUND.

Inputs: `documentId`, `animationId`, `keyframeId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 55.

## draworder.key.move

Move a draw-order key (by id) to a new time (draw-order times are strictly ascending). Landing on an occupied time is a typed KEYFRAME_COLLISION; a missing key is a typed KEYFRAME_NOT_FOUND.

Inputs: `documentId`, `animationId`, `keyframeId`, `time`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 56.

## draworder.key.set

Insert or update a draw-order key at a time: a compact list of per-slot signed offsets from the setup draw order (an empty list restores the setup order). Each slot must exist and target a distinct in-range index (DRAW_ORDER otherwise). Updating an existing key at the same time keeps its id.

Inputs: `documentId`, `animationId`, `time`, `offsets`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 57.

## effect.create

Create a new, layer-less effect in the VFX library and return its id. Add layers with effect.layer.add.

Inputs: `documentId`, `name`, `duration`, `deterministic`, `simulationDt`, `blendMode`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 58.

## effect.delete

Delete an effect and cascade-remove every bundle item that references it (one undo step).

Inputs: `documentId`, `effectId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 59.

## effect.get

Get one effect with all its layers, bodies, and life curves by id.

Inputs: `documentId`, `effectId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 60.

## effect.getAtlas

Return the current VFX atlas (pages and regions).

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 61.

## effect.getSnapshot

Return the deterministic snapshot of the whole effects library (effects, atlas, bundles).

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 62.

## effect.layer.add

Append a default layer (emitter / spriteAnimator / ribbonTrail) to an effect and return its id. `region` must resolve in the effects atlas or export will fail.

Inputs: `documentId`, `effectId`, `kind`, `blendMode`, `region`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 63.

## effect.layer.remove

Remove a layer from an effect (one undo step restores it at its prior z position).

Inputs: `documentId`, `effectId`, `layerId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 64.

## effect.layer.reorder

Reorder an effect layers by an explicit ordered layer-id list (a permutation of the current layer ids; z order, first is bottom).

Inputs: `documentId`, `effectId`, `order`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 65.

## effect.layer.setBlendMode

Set a layer per-layer blend mode.

Inputs: `documentId`, `effectId`, `layerId`, `blendMode`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 66.

## effect.layer.setField

Replace a layer body with a full rebuilt body (the caller patches one field and passes the whole body). `field` is the coalesce key. The body `type` must match the existing layer type.

Inputs: `documentId`, `effectId`, `layerId`, `field`, `body`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 67.

## effect.lifeStop.add

Insert an interior stop (t in (0,1)) into a layer life curve, keeping t strictly ascending. `value` is a scalar or an {r,g,b} matching the curve field.

Inputs: `documentId`, `effectId`, `layerId`, `field`, `t`, `value`, `curve`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 68.

## effect.lifeStop.move

Move a stop to a new t, keeping strict-ascending order and the t=0 / t=1 anchor positions.

Inputs: `documentId`, `effectId`, `layerId`, `stopId`, `t`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 69.

## effect.lifeStop.remove

Remove an interior stop from a layer life curve. The t=0 / t=1 anchors and the two-stop floor are protected (EFFECT_EDIT lifeCurveMinStops).

Inputs: `documentId`, `effectId`, `layerId`, `stopId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 70.

## effect.lifeStop.setCurve

Set a stop outgoing easing (linear / stepped / a cubic bezier).

Inputs: `documentId`, `effectId`, `layerId`, `stopId`, `curve`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 71.

## effect.lifeStop.setValue

Set a stop value (a scalar or an {r,g,b} matching the curve field shape).

Inputs: `documentId`, `effectId`, `layerId`, `stopId`, `value`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 72.

## effect.list

List the effects (id, name, meta, layer count) in library order.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 73.

## effect.rename

Rename an effect (identity is the id, so bundle-item references are unaffected).

Inputs: `documentId`, `effectId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 74.

## effect.setAtlas

Replace the VFX atlas. Rejects (EFFECTS_ATLAS_DANGLING_REGION) any swap that drops a region a layer still references.

Inputs: `documentId`, `atlas`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 75.

## effect.setMeta

Set an effect duration (null = endless), deterministic flag, and/or simulationDt (must be > 0). Only the provided fields change.

Inputs: `documentId`, `effectId`, `duration`, `deterministic`, `simulationDt`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 76.

## event.define

Create a document-level event definition (its int/float/string payload defaults and an optional audio hint) and return its id. The name must be unique across event definitions.

Inputs: `documentId`, `name`, `int`, `float`, `string`, `audio`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 77.

## event.delete

Delete an event definition and cascade-remove every animation event key that fires it (one undo step).

Inputs: `documentId`, `eventId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 78.

## event.get

Get one document-level event definition by id.

Inputs: `documentId`, `eventId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 79.

## event.key.delete

Delete an event-timeline key (by id) from an animation. A missing key is a typed KEYFRAME_NOT_FOUND.

Inputs: `documentId`, `animationId`, `keyframeId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 80.

## event.key.move

Move an event-timeline key (by id) to a new time, keeping the timeline non-decreasing in time (coincident event firings are legal). A time with no such key is a typed KEYFRAME_NOT_FOUND.

Inputs: `documentId`, `animationId`, `keyframeId`, `time`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 81.

## event.key.set

Insert or update an event-timeline key that fires an event definition at a time, optionally overriding its int/float/string payload defaults (an absent override defers to the definition). Updating an existing key that fires the same event at the same time keeps its id.

Inputs: `documentId`, `animationId`, `eventId`, `time`, `int`, `float`, `string`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 82.

## event.list

List the document-level event definitions (id, name, payload defaults, audio hint).

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 83.

## event.rename

Rename an event definition (identity is the id, so an animation event key never re-binds). The new name must be unique across event definitions.

Inputs: `documentId`, `eventId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 84.

## event.setAudio

Set (or, when audio is absent, clear) an event definition audio hint. `volume` must be in [0, 1] and `balance` in [-1, 1] (EVENT_EDIT audioRange otherwise).

Inputs: `documentId`, `eventId`, `audio`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 85.

## event.setDefaults

Replace an event definition int/float/string payload defaults wholesale (an absent field clears that default). The audio hint is left untouched.

Inputs: `documentId`, `eventId`, `int`, `float`, `string`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 86.

## history.beginInteraction

Start a coalescing interaction; subsequent edits collapse into one undo step.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 87.

## history.endInteraction

Commit the interaction as a single undo step with the given label.

Inputs: `documentId`, `label`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 88.

## history.getState

Report whether undo/redo are available and their labels.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 89.

## history.redo

Redo the last undone change.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 90.

## history.undo

Undo the last committed change.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 91.

## ik.createConstraint

Create an IK constraint over a 1 or 2 bone chain reaching toward a target bone, and return its id. The chain is parent-then-direct-child for a two-bone chain. Rejected as CONSTRAINT (with a reason: chainArity, chainDiscontinuous, boneMissing, targetMissing, cycle, or duplicateName).

Inputs: `documentId`, `name`, `boneIds`, `targetId`, `mix`, `bendPositive`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 92.

## ik.deleteConstraint

Delete an IK constraint, cascading every animation IK timeline keyed to it (one undo step).

Inputs: `documentId`, `ikConstraintId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 93.

## ik.deleteKeyframe

Delete an IK keyframe (by id) from a constraint IK channel.

Inputs: `documentId`, `animationId`, `ikConstraintId`, `keyframeId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 94.

## ik.get

Get one IK constraint by id.

Inputs: `documentId`, `ikConstraintId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 95.

## ik.list

List the IK constraints in solve order.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 96.

## ik.moveKeyframe

Move an IK keyframe (by id) to a new time on a constraint IK channel (IK times are strictly ascending). Landing on an occupied time is a typed KEYFRAME_COLLISION; a missing key is a typed KEYFRAME_NOT_FOUND. The moved keyframe keeps its mix/bendPositive/curve.

Inputs: `documentId`, `animationId`, `ikConstraintId`, `keyframeId`, `time`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 97.

## ik.setBendPositive

Set an IK constraint bend-direction flag (true bends positive, false negative).

Inputs: `documentId`, `ikConstraintId`, `bendPositive`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 98.

## ik.setDepth

Patch a Stage F2 IK depth field: `softness` (non-negative world-unit ease-in distance), and the `stretch` / `compress` / `uniform` booleans. Only the named fields change; the rest keep their current value. At least one field is required.

Inputs: `documentId`, `ikConstraintId`, `softness`, `stretch`, `compress`, `uniform`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 99.

## ik.setKeyframe

Insert or update an IK keyframe at a time on a constraint IK channel (mix + bendPositive). Updating an existing time keeps its curve; a new keyframe takes the optional insert `curve` (default linear).

Inputs: `documentId`, `animationId`, `ikConstraintId`, `time`, `mix`, `bendPositive`, `curve`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 100.

## ik.setMix

Set an IK constraint mix blend (0..1) toward the solved pose (absolute target).

Inputs: `documentId`, `ikConstraintId`, `mix`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 101.

## import.spineProject

Import a user-owned exported Spine project (a .json or a .skel binary) through the clean-room importer, open it as a new editable document, and return a summary plus any lossy-conversion warnings. Import only: this never writes or exports any Spine format (LAW 4 / PP-A5).

Inputs: `path`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 102.

## kf.attachment.delete

Delete the slot attachment-swap frame at exactly `time` from the stepped attachment timeline. A time with no frame is a typed KEYFRAME_NOT_FOUND.

Inputs: `documentId`, `animationId`, `slotId`, `time`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 103.

## kf.attachment.move

Move a slot attachment-swap frame (by id) to a new time on the stepped attachment timeline (times are strictly ascending). Landing on an occupied time is a typed KEYFRAME_COLLISION; a missing frame is a typed KEYFRAME_NOT_FOUND. The moved frame keeps its `name`.

Inputs: `documentId`, `animationId`, `slotId`, `keyframeId`, `time`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 104.

## kf.attachment.set

Insert or replace a slot attachment-swap frame at a time on the stepped attachment timeline. `name` is the attachment to show (which must resolve on the slot), or null to hide the slot. Replacing an existing frame at the same time keeps its id.

Inputs: `documentId`, `animationId`, `slotId`, `time`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 105.

## kf.curve

Set a keyframe outgoing interpolation curve (linear / stepped / bezier).

Inputs: `documentId`, `animationId`, `channel`, `boneId`, `slotId`, `keyframeId`, `curve`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 106.

## kf.delete

Delete a keyframe (by id) from its channel.

Inputs: `documentId`, `animationId`, `channel`, `boneId`, `slotId`, `keyframeId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 107.

## kf.move

Move a keyframe (by id) to a new time on its channel. Rejects landing on an occupied time as KEYFRAME_COLLISION.

Inputs: `documentId`, `animationId`, `channel`, `boneId`, `slotId`, `keyframeId`, `time`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 108.

## kf.paste

Insert several keyframes at absolute times in one undo step. Each item names its channel (with boneId/slotId), time, value (matching the channel), and curve.

Inputs: `documentId`, `animationId`, `items`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 109.

## kf.set

Insert or update a keyframe at a time on a channel. `channel` is rotate/translate/scale/shear (with boneId) or color (with slotId); `value` must match the channel shape. Updating an existing time keeps its curve; a new keyframe takes the optional insert `curve` (default linear).

Inputs: `documentId`, `animationId`, `channel`, `boneId`, `slotId`, `time`, `value`, `curve`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 110.

## mesh.addBoneBinding

Add one bone influence to an already-weighted mesh, seeded by proximity and re-normalized (capped to 4). Rejected as MESH_BINDING when the mesh is unweighted, the bone is missing, or the bone is already bound.

Inputs: `documentId`, `slotId`, `name`, `boneId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 111.

## mesh.addVertex

Add an interior vertex to a mesh. The editor re-triangulates and passes the recomputed uvs/triangles/vertices. Rejected as MESH_TOPOLOGY_LOCKED on a weighted or deformed mesh.

Inputs: `documentId`, `slotId`, `name`, `uvs`, `triangles`, `vertices`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 112.

## mesh.autoGridFill

Replace a mesh with an editor-computed regular interior grid (uvs/triangles/hullLength/vertices, optional edges) in one undoable step. Rejected as MESH_TOPOLOGY_LOCKED on a weighted or deformed mesh.

Inputs: `documentId`, `slotId`, `name`, `uvs`, `triangles`, `hullLength`, `vertices`, `edges`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 113.

## mesh.autoPerimeterTrace

Replace a mesh with an editor-computed silhouette-traced hull plus interior fill (uvs/triangles/hullLength/vertices, optional edges) in one undoable step. Rejected as MESH_TOPOLOGY_LOCKED on a weighted or deformed mesh.

Inputs: `documentId`, `slotId`, `name`, `uvs`, `triangles`, `hullLength`, `vertices`, `edges`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 114.

## mesh.autoWeight

Re-seed a weighted mesh by inverse distance to each bound bone segment (capped to the 4 nearest, normalized) as a starting point for manual paint. Rejected as MESH_BINDING when the mesh is unweighted.

Inputs: `documentId`, `slotId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 115.

## mesh.bindToBones

Convert an UNWEIGHTED mesh to the weighted encoding by binding it to a set of bones. weightMode rigidNearest gives each vertex weight 1 to its nearest bone; equalSplit splits equally across the (up to 4 nearest) bound bones. Skinning at setup pose reproduces the original geometry. Rejected as MESH_BINDING when the mesh is already weighted, the bone set is empty, or a bone is missing.

Inputs: `documentId`, `slotId`, `name`, `boneIds`, `weightMode`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 116.

## mesh.deleteVertex

Delete a mesh vertex. The editor re-triangulates and passes the recomputed uvs/triangles/vertices. Rejected as MESH_TOPOLOGY_LOCKED on a weighted or deformed mesh.

Inputs: `documentId`, `slotId`, `name`, `uvs`, `triangles`, `vertices`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 117.

## mesh.generateFromRegion

Replace a region attachment with a mesh under the same name. The editor computes the quad-from-region geometry (uvs/triangles/hullLength/flat unweighted vertices) and passes it; the mesh keeps the region atlas path. Undo restores the exact region.

Inputs: `documentId`, `slotId`, `name`, `uvs`, `triangles`, `hullLength`, `width`, `height`, `color`, `edges`, `vertices`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 118.

## mesh.moveVertex

Move one mesh vertex to (x, y). Never re-triangulates (indices stable); always allowed (not topology-locked). Wrap a drag in beginInteraction/endInteraction to coalesce it into one undo step.

Inputs: `documentId`, `slotId`, `name`, `vertexIndex`, `x`, `y`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 119.

## mesh.normalizeWeights

Re-normalize every vertex of a weighted mesh to sum 1 and cap to 4 influences (idempotent). Rejected as MESH_BINDING when the mesh is unweighted.

Inputs: `documentId`, `slotId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 120.

## mesh.paintWeight

Apply a weight-paint stroke to one active bone across a set of dabs (per-vertex weight adjustments); each touched vertex is re-normalized (non-active proportions preserved) and capped to 4. mode add raises, subtract lowers, smooth applies the supplied signed delta. Wrap a stroke in beginInteraction/endInteraction to coalesce its dabs into one undo step. Rejected as MESH_BINDING when the mesh is unweighted, the bone is missing, or a dab indexes a vertex out of range.

Inputs: `documentId`, `slotId`, `name`, `activeBoneId`, `dabs`, `mode`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 121.

## mesh.removeBoneBinding

Drop one bone influence from a weighted mesh and re-normalize (a vertex left with no influence falls back to its nearest remaining bound bone). Rejected as MESH_BINDING when the mesh is unweighted, the bone is not bound, or it is the only bound bone (use mesh.unbind).

Inputs: `documentId`, `slotId`, `name`, `boneId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 122.

## mesh.sample

Return final world-space vertices, triangles, and bounds after constraints, skinning, and deform. Supports weighted and linked meshes and named-skin default fallback. Physics replays at 60 Hz.

Inputs: `documentId`, `slotId`, `name`, `animationId`, `time`, `skin`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 123.

## mesh.setEdges

Set or replace a mesh edges (wireframe) array, as vertex-index pairs. Does not change topology; always allowed. An empty array clears the wireframe.

Inputs: `documentId`, `slotId`, `name`, `edges`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 124.

## mesh.unbind

Clear all weights, returning a mesh to the unweighted flat encoding (re-derived from the current setup pose so it renders identically). Required before changing a weighted mesh topology. Rejected as MESH_BINDING when the mesh is unweighted or still has deform keyframes.

Inputs: `documentId`, `slotId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 125.

## path.addCurve

Append one cubic curve (three control points) to the end of a path spline; the arc-length table is recomputed. Rejected as PATH (reason: notFound).

Inputs: `documentId`, `slotId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 126.

## path.createConstraint

Create a path constraint that distributes a set of bones along the path attachment carried by a target SLOT, and return its id. Rejected as CONSTRAINT (reason: targetMissing, targetNotPath, boneMissing, chainArity, or duplicateName).

Inputs: `documentId`, `name`, `targetSlotId`, `boneIds`, `params`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 127.

## path.deleteConstraint

Delete a path constraint, cascading every animation path timeline keyed to it (one undo step).

Inputs: `documentId`, `pathConstraintId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 128.

## path.deleteControlPoint

Delete one ANCHOR control point (pointIndex must be a multiple of 3), collapsing the curve it bounds; the arc-length table is recomputed. A path keeps at least one curve. Rejected as PATH (reason: notFound, pointRange for a handle/out-of-range index, or minCurves).

Inputs: `documentId`, `slotId`, `name`, `pointIndex`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 129.

## path.deleteKeyframe

Delete a path keyframe (by id) from a constraint path channel.

Inputs: `documentId`, `animationId`, `pathConstraintId`, `keyframeId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 130.

## path.get

Read a path attachment: its openness, parametrization flag, flat control-point stream, and cumulative arc-length table. Errors PATH_NOT_FOUND when the attachment is absent or not a path.

Inputs: `documentId`, `slotId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 131.

## path.getConstraint

Get one path constraint by id.

Inputs: `documentId`, `pathConstraintId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 132.

## path.listConstraints

List the path constraints in solve order.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 133.

## path.moveControlPoint

Move one path control point (anchor or handle). The arc-length table is recomputed. Rejected as PATH (reason: notFound or pointRange).

Inputs: `documentId`, `slotId`, `name`, `pointIndex`, `x`, `y`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 134.

## path.moveKeyframe

Move a path keyframe (by id) to a new time (path times are strictly ascending). Landing on an occupied time is a typed KEYFRAME_COLLISION; a missing key is a typed KEYFRAME_NOT_FOUND. The moved keyframe keeps its channels/curve.

Inputs: `documentId`, `animationId`, `pathConstraintId`, `keyframeId`, `time`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 135.

## path.removeCurve

Drop the last cubic curve from a path spline (a path keeps at least one curve). Rejected as PATH (reason: notFound or minCurves).

Inputs: `documentId`, `slotId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 136.

## path.setClosed

Set a path spline open or closed. Closing drops the trailing anchor; opening appends one at the first anchor, so the control-point count stays valid. Rejected as PATH (reason: notFound).

Inputs: `documentId`, `slotId`, `name`, `closed`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 137.

## path.setConstantSpeed

Set a path spline arc-length (constant-speed) vs naive-t parametrization. A pure flag flip. Rejected as PATH (reason: notFound).

Inputs: `documentId`, `slotId`, `name`, `constantSpeed`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 138.

## path.setKeyframe

Insert or update a path-constraint keyframe at a time. Each channel (position/spacing/mixRotate/mixX/mixY) is optional; an omitted channel keeps its base value at solve time. Updating an existing time keeps its curve; a new keyframe takes the optional insert `curve` (default linear).

Inputs: `documentId`, `animationId`, `pathConstraintId`, `time`, `position`, `spacing`, `mixRotate`, `mixX`, `mixY`, `curve`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 139.

## path.setParams

Patch a path constraint parameter: the modes (positionMode/spacingMode/rotateMode), the scalars (position/spacing/offsetRotation), or the mix channels (mixRotate/mixX/mixY in [0,1]). Only the named fields change; at least one is required.

Inputs: `documentId`, `pathConstraintId`, `positionMode`, `spacingMode`, `rotateMode`, `position`, `spacing`, `offsetRotation`, `mixRotate`, `mixX`, `mixY`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 140.

## physics.createConstraint

Create a physics constraint that simulates a subset of ONE bone's local channels (x/y/rotation/scaleX/shearX) as a damped-driven spring, and return its id. `channels` must be non-empty and duplicate-free. Rejected as CONSTRAINT (reason: boneMissing, channelsEmpty, channelDuplicate, or duplicateName).

Inputs: `documentId`, `name`, `boneId`, `channels`, `params`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 141.

## physics.deleteConstraint

Delete a physics constraint, cascading every animation physics timeline keyed to it (one undo step).

Inputs: `documentId`, `physicsConstraintId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 142.

## physics.deleteKeyframe

Delete a physics keyframe (by id) from a constraint physics channel.

Inputs: `documentId`, `animationId`, `physicsConstraintId`, `keyframeId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 143.

## physics.getConstraint

Get one physics constraint by id.

Inputs: `documentId`, `physicsConstraintId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 144.

## physics.getSettings

Get the OPTIONAL skeleton physics settings block (global gravity/wind/master mix), or null when the document defines none (the identity default: no global weather, unit master mix).

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 145.

## physics.listConstraints

List the physics constraints in solve order.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 146.

## physics.moveKeyframe

Move a physics keyframe (by id) to a new time (physics times are strictly ascending). Landing on an occupied time is a typed KEYFRAME_COLLISION; a missing key is a typed KEYFRAME_NOT_FOUND. The moved keyframe keeps its channels/curve.

Inputs: `documentId`, `animationId`, `physicsConstraintId`, `keyframeId`, `time`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 147.

## physics.renameConstraint

Rename a physics constraint (identity is the id, so its timeline tracks are unaffected). Rejected as CONSTRAINT (reason: notFound or duplicateName).

Inputs: `documentId`, `physicsConstraintId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 148.

## physics.setChannels

Replace a physics constraint's simulated channel set (non-empty, duplicate-free subset of x/y/rotation/scaleX/shearX). Rejected as CONSTRAINT (reason: notFound, channelsEmpty, or channelDuplicate).

Inputs: `documentId`, `physicsConstraintId`, `channels`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 149.

## physics.setKeyframe

Insert or update a physics-constraint keyframe at a time. Each dynamic channel (mix/inertia/strength/damping/wind/gravity) is optional; an omitted channel keeps its base value at solve time. Updating an existing time keeps its curve; a new keyframe takes the optional insert `curve` (default linear). step/mass/channels are NOT keyable.

Inputs: `documentId`, `animationId`, `physicsConstraintId`, `time`, `mix`, `inertia`, `strength`, `damping`, `wind`, `gravity`, `curve`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 150.

## physics.setParams

Patch a physics constraint scalar parameter: step (>0), inertia/damping/mix ([0,1]), strength (>=0), mass (>0), or wind/gravity (finite). Only the named fields change; at least one is required.

Inputs: `documentId`, `physicsConstraintId`, `step`, `inertia`, `strength`, `damping`, `mass`, `wind`, `gravity`, `mix`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 151.

## physics.setSettings

Set or CLEAR the global physics settings block. Pass { gravity, wind, mix } to set it, or `settings: null` to clear it (restoring the identity default).

Inputs: `documentId`, `settings`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 152.

## physics.setTargetBone

Retarget a physics constraint to a different bone (the single driven/setpoint bone). Rejected as CONSTRAINT (reason: notFound or boneMissing).

Inputs: `documentId`, `physicsConstraintId`, `boneId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 153.

## render_frame

Rasterize the current document to a PNG for headless authoring feedback (ADR-0006) and return it base64-encoded. Renders the setup pose, or an animation sampled at `time` (clamped to the animation duration). Atlas page PNGs referenced by the document are loaded from the project root; a referenced page file that is missing on disk is a loud error. When the document has no atlas pages at all, attachments render as tintable white placeholders and `placeholders` is true. Pass `effect` to overlay a solved effect/bundle from the live effects library ON TOP of the skeleton in the same frame (world-space anchors only in this pass; bone anchors are not wired yet).

Inputs: `documentId`, `animation`, `time`, `width`, `height`, `fit`, `background`, `effect`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 154.

## skin.create

Create a NAMED (non-default) skin and return its id. The implicit "default" skin is reserved. Rejected as SKIN (with a reason: defaultProtected or duplicateName).

Inputs: `documentId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 155.

## skin.delete

Delete a NAMED skin, cascading every animation deform timeline keyed to it (one undo step).

Inputs: `documentId`, `skinId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 156.

## skin.get

Get one NAMED skin (and its attachment addresses) by id.

Inputs: `documentId`, `skinId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 157.

## skin.list

List the NAMED (non-default) skins in skin order, each with its attachment addresses.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 158.

## skin.removeAttachment

Remove an attachment from a NAMED skin at a (slot, attachment-name) address. Rejected as SKIN (reason notFound) when the skin or the addressed attachment is absent.

Inputs: `documentId`, `skinId`, `slotId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 159.

## skin.rename

Rename a NAMED skin (identity is the id, so deform tracks are unaffected). Rejected as SKIN (with a reason: defaultProtected, notFound, or duplicateName).

Inputs: `documentId`, `skinId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 160.

## skin.scope.add

Add a bone or constraint NAME to a NAMED skin Stage F2 scoping list (the bones/constraints active only while this skin is active). Rejected as SKIN (reason: notFound, scopeDuplicate, scopeUnknownBone, or scopeUnknownConstraint).

Inputs: `documentId`, `skinId`, `scope`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 161.

## skin.scope.remove

Remove a bone or constraint NAME from a NAMED skin scoping list (clearing the dimension when the last entry goes). Rejected as SKIN (reason: notFound or scopeMissing).

Inputs: `documentId`, `skinId`, `scope`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 162.

## skin.setAttachment

Add or replace a region attachment on a NAMED skin at a (slot, attachment-name) address. The `path` references an atlas region. Rejected as SKIN (with a reason: notFound or slotMissing).

Inputs: `documentId`, `skinId`, `slotId`, `attachment`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 163.

## slot.activeAttachment

Set the slot setup-pose active attachment name (null clears it).

Inputs: `documentId`, `slotId`, `attachment`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 164.

## slot.blend

Set a slot blend mode (the format BlendMode enum).

Inputs: `documentId`, `slotId`, `blendMode`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 165.

## slot.color

Set a slot tint color (RGBA, each channel 0..1).

Inputs: `documentId`, `slotId`, `color`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 166.

## slot.create

Create a slot riding a bone and return its id.

Inputs: `documentId`, `boneId`, `name`, `color`, `darkColor`, `attachment`, `blendMode`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 167.

## slot.darkColor

Set or clear a slot setup DARK color (Stage F2 two-color tint, RGBA 0..1). A non-null color enables the two-color tint and is required before keying the `dark` timeline; `color: null` disables it.

Inputs: `documentId`, `slotId`, `color`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 168.

## slot.delete

Delete a slot and its attachments (one undo step).

Inputs: `documentId`, `slotId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 169.

## slot.flow.addTransition

Append a transition (from + on match + to) to the feature-flow graph. The shape is validated at the boundary; endpoint existence is an import-time validator concern.

Inputs: `documentId`, `transition`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 170.

## slot.flow.createState

Add a named feature-flow state (optional cinematic node). Rejects a duplicate or empty name (SLOT_EDIT).

Inputs: `documentId`, `name`, `node`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 171.

## slot.flow.deleteState

Delete a named state and every transition incident to it (one undo step). The mandatory "base" state cannot be deleted (SLOT_EDIT baseStateProtected).

Inputs: `documentId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 172.

## slot.flow.get

Return the feature-flow graph (states, transitions, entry).

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 173.

## slot.flow.removeTransition

Remove one transition by its index in the graph transition list.

Inputs: `documentId`, `index`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 174.

## slot.flow.renameState

Rename a state and rewrite every transition that references it. "base" cannot be renamed and the new name must not collide (SLOT_EDIT).

Inputs: `documentId`, `from`, `to`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 175.

## slot.get

Get one slot (and its attachment names) by id.

Inputs: `documentId`, `slotId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 176.

## slot.grid.get

Return the current slot grid config.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 177.

## slot.grid.preset

Apply a canonical grid preset in one call: reelStrip5x3, scatterPay6x5, or cluster7x7.

Inputs: `documentId`, `preset`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 178.

## slot.grid.set

Set the slot grid config (topology + dimensions + gravity, optional anticipation). Rejects an invalid topology/shape combination (SLOT_EDIT).

Inputs: `documentId`, `grid`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 179.

## slot.list

List the slots in setup-pose draw order.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 180.

## slot.rename

Rename a slot (identity is the id, so references are unaffected).

Inputs: `documentId`, `slotId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 181.

## slot.reorder

Move a slot to a new index in the setup-pose draw order.

Inputs: `documentId`, `slotId`, `toIndex`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 182.

## slot.scene.get

Return the whole slot-scene snapshot (grid, symbol library, win sequencer, feature flows, tumble, refs).

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 183.

## slot.symbol.get

Return the anim set mapped to one SymbolId, or null when the symbol is unmapped.

Inputs: `documentId`, `symbolId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 184.

## slot.symbol.list

List the mapped symbols (SymbolId + anim set) in id order.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 185.

## slot.symbol.map

Map a SymbolId to a skeleton + idle/land/win(/anticipation) animation set, adding the skeletonRef to the scene refs. Provide `skeletonAnimationNames` to enforce that the chosen names exist.

Inputs: `documentId`, `symbolId`, `animSet`, `skeletonAnimationNames`, `skeletonHash`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 186.

## slot.symbol.unmap

Remove a SymbolId mapping, pruning its skeletonRef when no remaining symbol references it. Rejects an unmapped symbol (SLOT_EDIT notMapped).

Inputs: `documentId`, `symbolId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 187.

## slot.tumble.get

Return the tumble/cascade choreography.

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 188.

## slot.tumble.set

Set the tumble/cascade timing (explode/drop/refill/settle/step ms as non-negative integers) plus the drop easing and rollup curve. Coalesces on the session.

Inputs: `documentId`, `tumble`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 189.

## slot.winseq.create

Create a new, empty, named win sequence. Rejects a duplicate name (SLOT_EDIT).

Inputs: `documentId`, `name`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 190.

## slot.winseq.get

Return the win-sequencer config (sequences, thresholds, default sequence).

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 191.

## slot.winseq.reorderSteps

Reorder a sequence steps by an explicit new-order array of current step indices (a permutation).

Inputs: `documentId`, `sequenceName`, `order`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 192.

## slot.winseq.setStep

Set or append a step (atMs + target + action) at an index in a named sequence. An index equal to the step count appends; a smaller index replaces. The step shape is validated at the boundary.

Inputs: `documentId`, `sequenceName`, `index`, `step`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 193.

## slot.winseq.setThresholds

Set the big/mega/epic win escalation thresholds (finite, non-negative). Coalesces on the session.

Inputs: `documentId`, `thresholds`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 194.

## transform.createConstraint

Create a transform constraint that drives a set of bones from a target with per-channel mix and additive offset, and return its id. Solves after all IK. Rejected as CONSTRAINT (with a reason: boneMissing, targetMissing, cycle, or duplicateName).

Inputs: `documentId`, `name`, `boneIds`, `targetId`, `params`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 195.

## transform.deleteConstraint

Delete a transform constraint, cascading every animation transform timeline keyed to it (one undo step).

Inputs: `documentId`, `transformConstraintId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 196.

## transform.deleteKeyframe

Delete a transform keyframe (by id) from a constraint channel.

Inputs: `documentId`, `animationId`, `transformConstraintId`, `keyframeId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 197.

## transform.get

Get one transform constraint by id.

Inputs: `documentId`, `transformConstraintId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 198.

## transform.list

List the transform constraints in solve order (after all IK).

Inputs: `documentId`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 199.

## transform.moveKeyframe

Move a transform keyframe (by id) to a new time on a constraint channel (times are strictly ascending). Landing on an occupied time is a typed KEYFRAME_COLLISION; a missing key is a typed KEYFRAME_NOT_FOUND. The moved keyframe keeps all six mix channels and its curve.

Inputs: `documentId`, `animationId`, `transformConstraintId`, `keyframeId`, `time`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 200.

## transform.setKeyframe

Insert or update a transform keyframe at a time on a constraint channel. `mix` carries the six per-channel factors; an omitted channel keeps its base value at solve time. Updating an existing time keeps its curve; a new keyframe takes the optional insert `curve` (default linear).

Inputs: `documentId`, `animationId`, `transformConstraintId`, `time`, `mix`, `curve`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 201.

## transform.setParams

Patch a transform constraint mix/offset channels (only the named channels change; the rest keep their current value). The patch holds the absolute target values. At least one channel required.

Inputs: `documentId`, `transformConstraintId`, `patch`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 202.

## transform.setVariants

Patch a transform constraint Stage F2 variant flag: `local` (local-space read/write instead of the world-space blend) and `relative` (offset relative to the bone current value instead of an absolute blend). Only the named flags change. At least one flag is required.

Inputs: `documentId`, `transformConstraintId`, `local`, `relative`.

Exact types, bounds, required fields, and defaults: [mcp-tools.json](./mcp-tools.json), entry 203.
