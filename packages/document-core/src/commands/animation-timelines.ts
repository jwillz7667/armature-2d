import type { AnimationEntity } from '../model/doc-state';

// One traversal for temporal bounds across the complete editable animation surface. Object.values
// includes future split channels automatically; the constraint and nested deform families remain
// explicit so an unrelated numeric property cannot accidentally become a timeline.
export function lastAnimationKeyTime(animation: AnimationEntity): number {
  let last = -1; // Distinguish no keys from a key at time zero.
  const visit = (frames: readonly { readonly time: number }[]): void => {
    for (const frame of frames) last = Math.max(last, frame.time);
  };
  for (const channels of animation.bones.values()) {
    for (const frames of Object.values(channels)) visit(frames);
  }
  for (const channels of animation.slots.values()) {
    for (const frames of Object.values(channels)) visit(frames);
  }
  for (const tracks of [animation.ik, animation.transform, animation.path, animation.physics]) {
    for (const frames of tracks.values()) visit(frames);
  }
  for (const slots of animation.deform.values()) {
    for (const attachments of slots.values()) {
      for (const frames of attachments.values()) visit(frames);
    }
  }
  visit(animation.events);
  visit(animation.drawOrder);
  return last;
}
