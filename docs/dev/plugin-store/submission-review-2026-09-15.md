# Armature 2D submission review - 2026-09-15

## Result

Generated `chatgpt-app-submission.json` at the repository root: Armature 2D,
subtitle "Rig, animate and render 2D", Productivity, all 208 MCP tools,
five positive cases and three negative cases. This is an import draft, not an
accepted or published listing. Test cases are reviewer instructions, not a claim
that the ChatGPT flows have already passed.

Used OpenAI's official `chatgpt-app-submission` skill from
https://github.com/openai/openai-developers-for-cursor at commit
`9120f1f6bb47964651ab822e24b4f358e3638ae3`.
The schema endpoint in the skill's older example resolves to the current canonical
https://developers.openai.com/plugins/schemas/chatgpt-app-submission.v1.json;
the artifact uses that canonical URI and is validated against the downloaded schema.

## Review findings and next steps

- Tool hints: all 208 tools explicitly set all three required boolean annotations;
  the artifact matches the generated source catalog exactly. Mutations remain
  confined to private projects. Save can overwrite files; packing writes atlas
  files that document undo cannot restore; close discards unsaved session changes.
- Sensitive input solicitation: no obvious fields requesting payment card data,
  credentials, MFA codes, health data, or government identifiers were found in the
  tool schemas. Project content and paths may contain user-provided personal data;
  handle these under the published policy and retain existing path/auth safeguards.
- Tool data use: source inspection found no unexplained sensitive-data collection
  in project tools. Returned snapshots, exports and previews expose project data
  to the invoking client. The listing describes private project workflows and the
  public policy explains AI-client exchanges. Review live account isolation before launch.
- Naming and descriptions: `document.getSnapshot` describes bones/order although
  it returns a broader skeleton snapshot; expand that description in a follow-up.
  Do not imply desktop control, texture synthesis, complete binary Spine import,
  or complete effects/slot-project persistence. Generated app copy states the
  headless and persistence limitations. These are not missing-hint blockers.
- Widget CSP: no MCP widget UI is exposed by this server, so widget CSP review is
  not applicable; retain the separate billing-page CSP safeguards.
- Output schemas: all 208 tools omit `outputSchema`. This does not block generating
  this import file. Add an outputSchema so models can use this tool's results more
  reliably. See https://modelcontextprotocol.io/specification/draft/server/tools#tool.
  Define and validate schemas against actual success results before advertising
  structured outputs; affected names are listed below.

## Verification and release limits

- Source catalog freshness: `pnpm --filter @marionette/mcp-server reference:check`
  passed, verifying 208 tools.
- JSON: validated using the current official JSON Schema, with exact tool coverage,
  exact annotation parity, five positive and three negative cases, valid action
  references, and the subtitle length constraint checked independently.
- Previously completed Stripe sandbox verification: 29 checks covering trial,
  monthly/yearly Checkout creation, renewal, cancellation, failed-payment denial,
  recovery, portal creation and preventing a second trial. These were API/service
  checks, not browser Checkout completion or actual hosted webhook delivery.
- Human OAuth, portal tool scan, reviewer credentials, browser Checkout and real
  webhook delivery remain unverified. Production billing and its webhook remain
  disabled. Do not describe the subscription as launched.
- The published Viral Ventures LLC privacy page covers Armature 2D and is linked
  from billing and Stripe portal configuration. Reconcile the portal's verified
  individual publisher with the policy's business identity and review support,
  product and terms URLs before final attestations.
- No submission upload capability is available in this session. Import the JSON
  into the existing OpenAI Platform app draft, review populated fields and complete
  the remaining connection/reviewer checks before requesting platform review.

## Tools missing outputSchema

- `anim.create`
- `anim.delete`
- `anim.duplicate`
- `anim.duration`
- `anim.get`
- `anim.list`
- `anim.rename`
- `anim.sequence.delete`
- `anim.sequence.move`
- `anim.sequence.set`
- `atlas.get`
- `atlas.pack`
- `atlas.set`
- `attach.linkedmesh.create`
- `attach.linkedmesh.unlink`
- `attach.path.add`
- `attach.region.add`
- `attach.region.transform`
- `attach.remove`
- `attach.sequence.set`
- `bone.create`
- `bone.delete`
- `bone.get`
- `bone.list`
- `bone.move`
- `bone.rename`
- `bone.reparent`
- `bone.rotate`
- `bone.scale`
- `bone.setLength`
- `bone.shear`
- `bone.transformMode`
- `bundle.create`
- `bundle.delete`
- `bundle.get`
- `bundle.item.add`
- `bundle.item.remove`
- `bundle.item.reorder`
- `bundle.item.set`
- `bundle.list`
- `constraints.reorder`
- `deform.clearAttachment`
- `deform.deleteKeyframe`
- `deform.moveKeyframe`
- `deform.setCurve`
- `deform.setKeyframe`
- `document.close`
- `document.export`
- `document.getSnapshot`
- `document.getWorldTransforms`
- `document.new`
- `document.open`
- `document.save`
- `document.setMetadata`
- `document.validate`
- `draworder.key.delete`
- `draworder.key.move`
- `draworder.key.set`
- `effect.create`
- `effect.delete`
- `effect.get`
- `effect.getAtlas`
- `effect.getSnapshot`
- `effect.layer.add`
- `effect.layer.remove`
- `effect.layer.reorder`
- `effect.layer.setBlendMode`
- `effect.layer.setField`
- `effect.layer.setTrail`
- `effect.lifeStop.add`
- `effect.lifeStop.move`
- `effect.lifeStop.remove`
- `effect.lifeStop.setCurve`
- `effect.lifeStop.setValue`
- `effect.list`
- `effect.rename`
- `effect.setAtlas`
- `effect.setMeta`
- `event.define`
- `event.delete`
- `event.get`
- `event.key.delete`
- `event.key.move`
- `event.key.set`
- `event.list`
- `event.rename`
- `event.setAudio`
- `event.setDefaults`
- `history.beginInteraction`
- `history.endInteraction`
- `history.getState`
- `history.redo`
- `history.undo`
- `ik.createConstraint`
- `ik.deleteConstraint`
- `ik.deleteKeyframe`
- `ik.get`
- `ik.list`
- `ik.moveKeyframe`
- `ik.setBendPositive`
- `ik.setDepth`
- `ik.setKeyframe`
- `ik.setMix`
- `import.spineProject`
- `kf.attachment.delete`
- `kf.attachment.move`
- `kf.attachment.set`
- `kf.curve`
- `kf.delete`
- `kf.move`
- `kf.paste`
- `kf.set`
- `mesh.addBoneBinding`
- `mesh.addVertex`
- `mesh.autoGridFill`
- `mesh.autoPerimeterTrace`
- `mesh.autoWeight`
- `mesh.bindToBones`
- `mesh.deleteVertex`
- `mesh.generateFromRegion`
- `mesh.moveVertex`
- `mesh.normalizeWeights`
- `mesh.paintWeight`
- `mesh.removeBoneBinding`
- `mesh.sample`
- `mesh.setEdges`
- `mesh.unbind`
- `path.addCurve`
- `path.createConstraint`
- `path.deleteConstraint`
- `path.deleteControlPoint`
- `path.deleteKeyframe`
- `path.get`
- `path.getConstraint`
- `path.listConstraints`
- `path.moveControlPoint`
- `path.moveKeyframe`
- `path.removeCurve`
- `path.setClosed`
- `path.setConstantSpeed`
- `path.setKeyframe`
- `path.setParams`
- `physics.createConstraint`
- `physics.deleteConstraint`
- `physics.deleteKeyframe`
- `physics.getConstraint`
- `physics.getSettings`
- `physics.listConstraints`
- `physics.moveKeyframe`
- `physics.renameConstraint`
- `physics.setChannels`
- `physics.setKeyframe`
- `physics.setParams`
- `physics.setSettings`
- `physics.setTargetBone`
- `render_frame`
- `skin.create`
- `skin.delete`
- `skin.get`
- `skin.list`
- `skin.removeAttachment`
- `skin.rename`
- `skin.scope.add`
- `skin.scope.remove`
- `skin.setAttachment`
- `slot.activeAttachment`
- `slot.blend`
- `slot.color`
- `slot.create`
- `slot.darkColor`
- `slot.delete`
- `slot.flow.addTransition`
- `slot.flow.createState`
- `slot.flow.deleteState`
- `slot.flow.get`
- `slot.flow.removeTransition`
- `slot.flow.renameState`
- `slot.flow.setGraph`
- `slot.get`
- `slot.grid.get`
- `slot.grid.preset`
- `slot.grid.set`
- `slot.list`
- `slot.rename`
- `slot.reorder`
- `slot.scene.get`
- `slot.scene.setRefs`
- `slot.symbol.get`
- `slot.symbol.list`
- `slot.symbol.map`
- `slot.symbol.unmap`
- `slot.tumble.get`
- `slot.tumble.set`
- `slot.winseq.create`
- `slot.winseq.get`
- `slot.winseq.reorderSteps`
- `slot.winseq.setConfig`
- `slot.winseq.setStep`
- `slot.winseq.setThresholds`
- `transform.createConstraint`
- `transform.deleteConstraint`
- `transform.deleteKeyframe`
- `transform.get`
- `transform.list`
- `transform.moveKeyframe`
- `transform.setKeyframe`
- `transform.setParams`
- `transform.setVariants`
