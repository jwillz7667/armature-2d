import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderFrame } from '../../../packages/render-preview/src/index';
import { decodePng } from '../../../packages/atlas-pack/src/index';
import { parseDocument } from '../../../packages/format/src/index';
import {
  buildPose,
  sampleSkeleton,
  resetToSetupPose,
  computeWorldTransforms,
} from '../../../packages/runtime-core/src/index';

const root = process.env.ARMATURE_PILOT_DIR;
if (!root) throw new Error('Set ARMATURE_PILOT_DIR');
const dir = join(root, 'qa/native');
mkdirSync(dir, { recursive: true });
const atlasRef = JSON.parse(readFileSync(join(root, 'atlas.json'), 'utf8')) as {
  pages: { file: string }[];
};
const atlas = {
  pages: new Map(
    atlasRef.pages.map((p: { file: string }) => [
      p.file,
      decodePng(readFileSync(join(root, p.file))),
    ]),
  ),
};
const cast = JSON.parse(readFileSync(join(root, 'cast-assets.json'), 'utf8'));
const report = [];
for (const c of cast) {
  const doc = parseDocument(
    JSON.parse(readFileSync(join(root, `rigs/${c.name}.armature.json`), 'utf8')),
    { verifyHash: true },
  );
  const fit = { x: -c.width * 0.65, y: -c.height * 1.13, w: c.width * 1.3, h: c.height * 1.22 };
  for (const [animation, time] of [
    ['idle', 0],
    ['walk', 0.0],
    ['walk', 0.3],
    ['walk', 0.6],
    ['walk', 0.9],
    ['point', 1.8],
  ] as const) {
    const result = renderFrame({
      document: doc,
      animation,
      time,
      atlas,
      viewport: { width: 650, height: 650, fit },
      background: { r: 0.83, g: 0.9, b: 0.9, a: 1 },
    });
    writeFileSync(join(dir, `${c.name}-${animation}-${time}.png`), result.png);
  }
  const pose = buildPose(doc);
  let footDrift = 0;
  resetToSetupPose(pose);
  computeWorldTransforms(pose);
  const rest = Array.from(pose.world);
  sampleSkeleton(doc, 'idle', 0, pose);
  let restJointDrift = 0;
  doc.bones.forEach((bone, i) => {
    if (/upper|lower/.test(bone.name))
      restJointDrift = Math.max(
        restJointDrift,
        Math.hypot(
          pose.world[i * 6 + 4]! - rest[i * 6 + 4]!,
          pose.world[i * 6 + 5]! - rest[i * 6 + 5]!,
        ),
      );
  });
  if (restJointDrift > 0.01)
    throw new Error(`${c.name}: IK changed the registered rest joints by ${restJointDrift}px`);
  const feet = doc.bones
    .map((b, i) => (b.name.endsWith('foot-control') ? i : -1))
    .filter((i) => i >= 0);
  sampleSkeleton(doc, 'idle', 0, pose);
  const start = feet.map((i) => [pose.world[i * 6 + 4], pose.world[i * 6 + 5]]);
  for (const t of [0.3, 0.6, 1.2, 2.4]) {
    sampleSkeleton(doc, 'idle', t, pose);
    feet.forEach((i, j) => {
      footDrift = Math.max(
        footDrift,
        Math.hypot(pose.world[i * 6 + 4]! - start[j]![0]!, pose.world[i * 6 + 5]! - start[j]![1]!),
      );
    });
  }
  report.push({
    character: c.name,
    bones: doc.bones.length,
    slots: doc.slots.length,
    ik: doc.ikConstraints.length,
    footDrift,
    restJointDrift,
  });
  console.log(
    `Reviewed ${c.name}: ${doc.bones.length} bones, stationary foot controls drift ${footDrift.toFixed(5)}px`,
  );
}
writeFileSync(join(dir, 'rig-review.json'), JSON.stringify(report, null, 2) + '\n');
