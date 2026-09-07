import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from '../../../packages/format/src/index';
import { buildPose, sampleSkeleton } from '../../../packages/runtime-core/src/index';
import type { EpisodeTimeline, SceneControls } from './scene-types.mts';

const root = process.env.ARMATURE_PILOT_DIR;
if (!root) throw new Error('Set ARMATURE_PILOT_DIR');
const timeline = JSON.parse(
  readFileSync(join(root, 'episode-timeline.json'), 'utf8'),
) as EpisodeTimeline;
const checks: {
  scene: string;
  time: number;
  actor: string;
  target: string;
  directionAgreement: number;
}[] = [];
for (const scene of timeline.scenes) {
  const controls = JSON.parse(
    readFileSync(join(root, `scene-controls/scene-${scene.id}.json`), 'utf8'),
  ) as SceneControls;
  const doc = parseDocument(
    JSON.parse(readFileSync(join(root, `scenes/Scene-${scene.id}.armature.json`), 'utf8')),
    { verifyHash: true },
  );
  const pose = buildPose(doc);
  const indices = new Map(doc.bones.map((b, i) => [b.name, i]));
  const point = (name: string, part: string) => {
    const index = indices.get(`${name.toLowerCase()}/${part}`);
    if (index === undefined) throw new Error(`Missing ${name}/${part}`);
    return [pose.world[index * 6 + 4]!, pose.world[index * 6 + 5]!] as const;
  };
  for (let fi = 12; fi < controls.frames.length - 4; fi += 12) {
    const frame = controls.frames[fi]!;
    sampleSkeleton(doc, 'pilot', frame.t, pose);
    for (const [name, actor] of Object.entries(frame.actors)) {
      const target = actor?.lookAt;
      if (!actor || !target || !frame.actors[target] || target === name) continue;
      if (Math.abs(actor.rootAngle ?? 0) > 15 || (actor.blink ?? 1) < 0.8) continue;
      // Allow the directed eye movement to settle after a change of listener.
      if (controls.frames[fi - 4]?.actors[name]?.lookAt !== target) continue;
      const eye = point(name, 'eye-near'),
        pupil = point(name, 'pupil-near');
      const far = point(target, 'eye-far'),
        near = point(target, 'eye-near');
      const dx = (far[0] + near[0]) / 2 - eye[0],
        dy = (far[1] + near[1]) / 2 - eye[1];
      const px = pupil[0] - eye[0],
        py = pupil[1] - eye[1];
      const magnitude = Math.hypot(dx, dy) * Math.hypot(px, py);
      if (magnitude < 1) continue;
      checks.push({
        scene: scene.id,
        time: frame.t,
        actor: name,
        target,
        directionAgreement: (dx * px + dy * py) / magnitude,
      });
    }
  }
}
const away = checks.filter((c) => c.directionAgreement <= 0);
writeFileSync(
  join(root, 'qa/eyeline-verification.json'),
  JSON.stringify(
    {
      checked: checks.length,
      lookingAway: away,
      minimumAgreement: Math.min(...checks.map((c) => c.directionAgreement)),
      checks,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Checked ${checks.length} settled native eyelines; ${away.length} point away from the intended listener`,
);
if (away.length) throw new Error(JSON.stringify(away));
