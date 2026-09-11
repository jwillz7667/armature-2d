import type { SkeletonDocument } from '@marionette/format/types';
import {
  buildPose,
  computeWorldTransforms,
  resetToSetupPose,
  resolveRenderMesh,
  sampleMeshVertices,
  sampleSkeleton,
  skinMeshInto,
  type Pose,
} from '@marionette/runtime-core';
import { McpToolError } from './errors';

interface SolvedQuery {
  readonly pose: Pose;
  readonly context: {
    readonly animation: string | null;
    readonly time: number;
    readonly skin: string;
    readonly physicsStep: number;
  };
}

// Stateless inspection reconstructs physics from rest. A query cannot alter the editing session,
// and repeated queries do not inherit simulation history from a previous sample.
export function sampleQueryPose(
  document: SkeletonDocument,
  animation: string | undefined,
  requestedTime: number,
  skin: string,
): SolvedQuery {
  const pose = buildPose(document);
  const clip = animation === undefined ? undefined : document.animations[animation];
  const time = clip === undefined ? 0 : Math.min(requestedTime, clip.duration);
  const physicsStep = document.physicsConstraints.length === 0 ? 0 : 1 / 60;
  if (animation === undefined) {
    resetToSetupPose(pose);
    computeWorldTransforms(pose);
  } else if (physicsStep === 0) {
    sampleSkeleton(document, animation, time, pose, skin);
  } else {
    sampleSkeleton(document, animation, 0, pose, skin, 0);
    const count = Math.floor(time * 60);
    for (let i = 1; i <= count; ++i)
      sampleSkeleton(document, animation, i / 60, pose, skin, physicsStep);
    const remainder = time - count / 60;
    if (remainder > 0) sampleSkeleton(document, animation, time, pose, skin, remainder);
  }
  return { pose, context: { animation: animation ?? null, time, skin, physicsStep } };
}

export function sampleQueryMesh(
  document: SkeletonDocument,
  solved: SolvedQuery,
  slotName: string,
  name: string,
): {
  vertexCount: number;
  vertices: number[];
  triangles: number[];
  hullLength: number;
  sourceSkin: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
} {
  const { pose, context } = solved;
  const active = document.skins.find((s) => s.name === context.skin)?.attachments[slotName]?.[name];
  const sourceSkin = active === undefined ? 'default' : context.skin;
  const attachment =
    active ?? document.skins.find((s) => s.name === 'default')?.attachments[slotName]?.[name];
  if (attachment === undefined || (attachment.type !== 'mesh' && attachment.type !== 'linkedmesh'))
    throw new McpToolError('MESH_SAMPLE', `Cannot sample ${sourceSkin}/${slotName}/${name}`, {
      reason: attachment === undefined ? 'not-found' : 'not-a-mesh',
    });
  const resolved = resolveRenderMesh(document, sourceSkin, slotName, attachment);
  if (resolved === null)
    throw new McpToolError('MESH_SAMPLE', 'Linked mesh geometry is missing', {
      reason: 'not-found',
    });
  const geometry = resolved.source;
  const vertices = new Float32Array(geometry.uvs.length);
  const slotIndex = pose.slotNames.indexOf(slotName);
  const vertexCount =
    context.animation === null
      ? skinMeshInto(geometry, pose, pose.slotBoneIndices[slotIndex]!, vertices)
      : sampleMeshVertices(
          document,
          context.animation,
          context.time,
          pose,
          sourceSkin,
          slotName,
          name,
          vertices,
        );
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let i = 0; i < vertices.length; i += 2) {
    bounds.minX = Math.min(bounds.minX, vertices[i]!);
    bounds.maxX = Math.max(bounds.maxX, vertices[i]!);
    bounds.minY = Math.min(bounds.minY, vertices[i + 1]!);
    bounds.maxY = Math.max(bounds.maxY, vertices[i + 1]!);
  }
  return {
    vertexCount,
    vertices: Array.from(vertices),
    triangles: [...geometry.triangles],
    hullLength: geometry.hullLength,
    sourceSkin,
    bounds,
  };
}
