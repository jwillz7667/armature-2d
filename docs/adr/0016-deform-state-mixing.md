# ADR-0016: Mesh deformation under AnimationState

- Status: IMPLEMENTED 2026-09-07; native state playback remains outside the available engine API.
- Scope: runtime-core, runtime-web, software preview and media exports using AnimationState.
- Related: ADR-0003 (post-skin offsets), ADR-0005 (animation tracks), ADR-0011 (linked meshes).

Mesh deformations previously used only the incoming entry on track 0. Crossfades jumped immediately,
and overlays on other tracks lost their deformation. The state sampler now blends world-space offsets
after skinning once with the state-solved bone pose. This does not change the document format.

Tracks apply in ascending order. The reference for the first track is zero deformation. For each track,
incoming weight is its alpha times fade fraction; outgoing weight is its own alpha times one minus the
fade fraction. With no outgoing entry the fraction is one. A missing channel or excluded slot has zero
weight. Alpha must be finite and in [0, 1].

Both entries blend against the same lower-track reference. The result is the weighted sum of their
sampled offsets plus the lower reference multiplied by one minus the sum of replacement weights.
An additive entry contributes its offsets without subtracting reference weight. This preserves identical
deforms during a crossfade, supports mixed additive/replacement transitions, and fades missing channels
smoothly back to the lower layer. The outgoing entry retains its own alpha, mode and slot mask.

`entry.deformSlots = null` includes all slots. An empty array excludes all deformation for that entry;
otherwise exact slot names are included. This runtime-only mask does not suppress bone or slot-color
timelines. Linked meshes resolve geometry and shared timelines before channel selection; selected skins
and default-skin fallbacks use the existing attachment resolver.

`sampleMeshVerticesWithState` requires the pose just solved by `applyAnimationState`. Incoming, outgoing
and accumulated offset buffers belong to that pose and grow only for a larger mesh. The web renderer
and software sequence renderer both call this function. The legacy single-clip sampler is unchanged.
ADR-0005's existing sequential bone/color mixing and track-0 region-sequence clock are unchanged.

Unity and Godot currently expose single-clip sampling, not AnimationState. This ADR does not claim
native multi-track equivalence. Their eventual state APIs must run the same numerical cases before
advertising support. Core tests cover endpoints, identical clips, sparse tracks, missing channels,
linked skins, additive layers, masks, invalid weights and buffer reuse; renderer tests cover the shared
state path and exported pixels.
