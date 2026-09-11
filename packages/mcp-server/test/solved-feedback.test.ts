import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeContentHash, parseDocument } from '@marionette/format';
import { buildPose, sampleMeshVertices, sampleSkeleton } from '@marionette/runtime-core';
import { SessionRegistry, TOOLS, type ToolDeps } from '../src';

function setup(rig: string) {
  const raw = JSON.parse(
    readFileSync(new URL(`../../conformance/src/rigs/${rig}.json`, import.meta.url), 'utf8'),
  );
  const parsed = parseDocument(raw);
  const document = { ...parsed, hash: computeContentHash(parsed) };
  const sessions = new SessionRegistry();
  const session = sessions.open(document);
  const noIO = async (): Promise<never> => {
    throw new Error('Read-only query used file I/O');
  };
  const deps: ToolDeps = {
    sessions,
    files: { read: noIO, write: noIO, readBinary: noIO, writeBinary: noIO, listDir: noIO },
  };
  const call = async (name: string, input: Record<string, unknown> = {}) => {
    const tool = TOOLS.find((t) => t.name === name)!;
    return (await tool.handler(deps, { documentId: session.id, ...input })) as Record<
      string,
      unknown
    >;
  };
  return { document, session, call };
}

describe('complete MCP solved feedback', () => {
  it('samples weighted deform against the canonical solver without mutating history', async () => {
    const { document, session, call } = setup('rig-deform');
    const animation = session.document.model.animations()[0]!;
    const slot = session.document.model.slots()[0]!;
    const before = session.document.model.snapshot();
    const output = await call('mesh.sample', {
      slotId: slot.id,
      name: 'panel',
      animationId: animation.id,
      time: 0.5,
    });
    const pose = buildPose(document);
    sampleSkeleton(document, animation.name, 0.5, pose);
    const expected = new Float32Array(8);
    sampleMeshVertices(
      document,
      animation.name,
      0.5,
      pose,
      'default',
      slot.name,
      'panel',
      expected,
    );
    expect(output.vertices).toEqual(Array.from(expected));
    expect(output.context).toMatchObject({ animation: animation.name, time: 0.5, skin: 'default' });
    expect(output.revision).toBe(session.document.model.revision);
    expect(session.document.model.snapshot()).toEqual(before);
    expect(session.document.history.canUndo).toBe(false);
    await expect(call('mesh.sample', { slotId: slot.id, name: 'missing' })).rejects.toMatchObject({
      code: 'MESH_SAMPLE',
      detail: { reason: 'not-found' },
    });
  });

  it('resolves linked mesh geometry and shared deform timelines', async () => {
    const { session, call } = setup('rig-linked-mesh');
    const animationId = session.document.model.animations()[0]!.id;
    const slotId = session.document.model.slots()[0]!.id;
    const parent = await call('mesh.sample', { slotId, name: 'body', animationId, time: 0.5 });
    const child = await call('mesh.sample', { slotId, name: 'bodyShared', animationId, time: 0.5 });
    expect(child.vertices).toEqual(parent.vertices);
    expect(child.triangles).toEqual(parent.triangles);
  });

  it('passes named skin context to scoped constraints', async () => {
    const { document, session, call } = setup('rig-skin-scoped');
    const animation = session.document.model.animations()[0]!;
    const skin = session.document.model.skins().find((s) => s.name === 'gold')!;
    const output = await call('document.getWorldTransforms', {
      animationId: animation.id,
      skin: skin.id,
      time: 0.5,
    });
    const pose = buildPose(document);
    sampleSkeleton(document, animation.name, 0.5, pose, 'gold');
    const transforms = output.transforms as { world: number[] }[];
    expect(transforms.flatMap((t) => t.world)).toEqual(Array.from(pose.world));
    expect(output.context).toMatchObject({ skin: 'gold' });
  });

  it('authors IK depth and replaces easing through validated MCP options', async () => {
    const { session, call } = setup('rig-ik-depth');
    const animationId = session.document.model.animations()[0]!.id;
    const ikConstraintId = session.document.model.ikConstraints()[0]!.id;
    const params = { animationId, ikConstraintId, time: 0.25, mix: 0.6, bendPositive: true };
    await call('ik.setKeyframe', { ...params, softness: 8, stretch: true, compress: true });
    const before = session.document.model.snapshot();
    const read = () =>
      session.document.model
        .getAnimation(animationId)!
        .ik.get(ikConstraintId)!
        .find((k) => k.time === 0.25)!;
    const first = read();
    await call('ik.setKeyframe', { ...params, replaceCurve: 'stepped', stretch: false });
    expect(read()).toEqual({ ...first, curve: 'stepped', stretch: false });
    await call('history.undo');
    expect(session.document.model.snapshot()).toEqual(before);
    await expect(call('ik.setKeyframe', { ...params, softness: -1 })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(session.document.model.snapshot()).toEqual(before);
  });

  it('returns deform keys and edits easing in place with exact undo', async () => {
    const { session, call } = setup('rig-deform');
    const animation = session.document.model.animations()[0]!;
    const slot = session.document.model.slots()[0]!;
    const channel = animation.deform.get('default')!.get(slot.id)!.get('panel')!;
    const key = channel[0]!;
    const inspected = await call('anim.get', { animationId: animation.id });
    expect(JSON.stringify(inspected)).toContain(key.id);
    expect(JSON.stringify(inspected)).toContain('offsets');
    const before = session.document.model.snapshot();
    await call('deform.setCurve', {
      animationId: animation.id,
      slotId: slot.id,
      skin: 'default',
      name: 'panel',
      keyframeId: key.id,
      curve: 'stepped',
    });
    const edited = session.document.model
      .getAnimation(animation.id)!
      .deform.get('default')!
      .get(slot.id)!
      .get('panel')![0]!;
    expect(edited).toEqual({ ...key, curve: 'stepped' });
    await call('history.undo');
    expect(session.document.model.snapshot()).toEqual(before);
    await expect(
      call('deform.setCurve', {
        animationId: animation.id,
        slotId: slot.id,
        skin: 'default',
        name: 'missing',
        keyframeId: key.id,
        curve: 'linear',
      }),
    ).rejects.toMatchObject({ code: 'KEYFRAME_NOT_FOUND' });
    expect(session.document.model.snapshot()).toEqual(before);
  });

  it('reconstructs physics at 60 Hz, clamps time, and rejects unbounded queries', async () => {
    const { document, session, call } = setup('rig-physics-swing');
    const animation = session.document.model.animations()[0]!;
    const output = await call('document.getWorldTransforms', {
      animationId: animation.id,
      time: 0.5,
    });
    const pose = buildPose(document);
    sampleSkeleton(document, animation.name, 0, pose, 'default', 0);
    for (let i = 1; i <= 30; ++i)
      sampleSkeleton(document, animation.name, i / 60, pose, 'default', 1 / 60);
    const transforms = output.transforms as { world: number[] }[];
    expect(transforms.flatMap((t) => t.world)).toEqual(Array.from(pose.world));
    expect(
      await call('document.getWorldTransforms', { animationId: animation.id, time: 0.5 }),
    ).toEqual(output);
    await expect(call('document.getWorldTransforms', { time: 1801 })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    const clamped = await call('document.getWorldTransforms', {
      animationId: animation.id,
      time: 100,
    });
    expect(clamped.context).toMatchObject({ time: animation.duration });
  });
});
