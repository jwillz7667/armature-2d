import { describe, expect, it } from 'vitest';
import {
  createDocument,
  newDocState,
  makeIdFactory,
  CreateBoneCommand,
  CreateAnimationCommand,
  SetIkKeyframeCommand,
  SetTransformKeyframeCommand,
  SetPathKeyframeCommand,
  exportProjectDocument,
  loadProjectDocument,
  exportDocument,
  type BoneId,
} from '../document';
import { buildPose, sampleSkeleton } from '@marionette/runtime-core';
import { createArtistConstraint } from './constraint-authoring';

function rig() {
  const env = { now: () => 1000, createIds: makeIdFactory };
  const doc = createDocument(newDocState('artist-flow'), env);
  const add = (name: string, parent: BoneId | null, x: number, y: number) => {
    const id = doc.ids.mint('bone');
    doc.history.execute(
      new CreateBoneCommand(id, parent, {
        name,
        length: 50,
        x,
        y,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        shearX: 0,
        shearY: 0,
        transformMode: 'normal',
      }),
    );
    return id;
  };
  const root = add('root', null, 0, 0);
  const shoulder = add('shoulder', root, 0, 0);
  const elbow = add('elbow', shoulder, 50, 0);
  const target = add('target', root, 60, 50);
  const animationId = doc.ids.mint('animation');
  doc.history.execute(new CreateAnimationCommand(animationId, 'move', 1));
  doc.history.checkpoint();
  return { doc, root, shoulder, elbow, target, animationId, env };
}

describe('artist constraint workflow', () => {
  it.each(['ik', 'transform', 'path'] as const)(
    'creates, keys, solves, saves, reopens, and undoes %s',
    (kind) => {
      const { doc, root, shoulder, elbow, target, animationId, env } = rig();
      const before = doc.model.snapshot();
      const created = createArtistConstraint(doc, {
        kind,
        name: 'follow',
        bones: kind === 'ik' ? [elbow, shoulder] : [shoulder],
        targetBone: kind === 'path' ? root : target,
      });
      expect(created.selection.kind).toBe(kind);
      const afterCreate = doc.model.snapshot();
      if (kind === 'ik') {
        const constraint = doc.model.ikConstraints()[0]!;
        doc.history.execute(
          new SetIkKeyframeCommand(animationId, constraint.id, 0.5, 0.8, false, 'linear', {
            softness: 5,
            stretch: true,
            compress: false,
          }),
        );
      } else if (kind === 'transform') {
        const constraint = doc.model.transformConstraints()[0]!;
        doc.history.execute(
          new SetTransformKeyframeCommand(animationId, constraint.id, 0.5, {
            mixRotate: 0.7,
            mixX: 0.7,
            mixY: 0.7,
            mixScaleX: 0,
            mixScaleY: 0,
            mixShearY: 0,
          }),
        );
      } else {
        const constraint = doc.model.pathConstraints()[0]!;
        expect(doc.model.getSlot(constraint.target)?.attachment).toBe('path');
        doc.history.execute(
          new SetPathKeyframeCommand(animationId, constraint.id, 0.5, {
            position: 0.5,
            spacing: 0,
            mixRotate: 1,
            mixX: 1,
            mixY: 1,
          }),
        );
      }
      const exported = exportDocument(doc.model);
      const pose = buildPose(exported);
      sampleSkeleton(exported, 'move', 0.5, pose);
      expect([...pose.world].every(Number.isFinite)).toBe(true);
      const project = exportProjectDocument(doc);
      const reopened = loadProjectDocument(project, env);
      expect(exportProjectDocument(reopened)).toEqual(project);
      doc.history.undo();
      expect(doc.model.snapshot()).toEqual(afterCreate);
      doc.history.undo();
      expect(doc.model.snapshot()).toEqual(before);
      doc.history.redo();
      expect(doc.model.snapshot()).toEqual(afterCreate);
    },
  );

  it('rolls back a compound path creation when the final constraint validation fails', () => {
    const { doc, root, shoulder, target } = rig();
    createArtistConstraint(doc, {
      kind: 'ik',
      name: 'duplicate',
      bones: [shoulder],
      targetBone: target,
    });
    const before = doc.model.snapshot();
    const label = doc.history.undoLabel;
    expect(() =>
      createArtistConstraint(doc, {
        kind: 'path',
        name: 'duplicate',
        bones: [shoulder],
        targetBone: root,
      }),
    ).toThrow();
    expect(doc.model.snapshot()).toEqual(before);
    expect(doc.history.undoLabel).toBe(label);
  });
});
