import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Author, type Character, type Rig } from './rig-author.mts';
import type { SceneControls, EpisodeTimeline } from './scene-types.mts';

const root = process.env.ARMATURE_PILOT_DIR;
if (!root) throw new Error('Set ARMATURE_PILOT_DIR');
const cast = JSON.parse(readFileSync(join(root, 'cast-assets.json'), 'utf8')) as Character[];
const atlas = JSON.parse(readFileSync(join(root, 'all-atlas.json'), 'utf8'));
const assets = JSON.parse(readFileSync(join(root, 'scene-assets.json'), 'utf8'));
const timeline = JSON.parse(
  readFileSync(join(root, 'episode-timeline.json'), 'utf8'),
) as EpisodeTimeline;
const requested = new Set(process.argv.slice(2));
const W = 1920,
  H = 1080;
mkdirSync(join(root, 'scenes'), { recursive: true });
mkdirSync(join(root, 'render-input'), { recursive: true });

for (const item of timeline.scenes) {
  if (requested.size && !requested.has(item.id)) continue;
  const scene = JSON.parse(
    readFileSync(join(root, `scene-controls/scene-${item.id}.json`), 'utf8'),
  ) as SceneControls;
  const a = new Author(root);
  await a.new(`Gunner N Pals - scene ${item.id}`, atlas);
  const camera = await a.bone('stage/camera', null, 0, 0);
  const bgBone = await a.bone('stage/background', camera, W / 2, H / 2);
  const bgSlot = await a.slot('background', bgBone);
  for (const name of ['park', 'tree', 'rainbow'])
    await a.region(bgSlot, name, `background-${name}`, 0, 0, W, H);
  await a.call('slot.activeAttachment', {
    documentId: a.id,
    slotId: bgSlot,
    attachment: scene.frames[0]!.set,
  });
  const names = [...new Set<string>(scene.frames.flatMap((f) => Object.keys(f.actors)))];
  const first = (name: string) => scene.frames.find((f) => f.actors[name])!.actors[name]!;
  const props = new Map<string, { bone: string; slot: string; width: number; height: number }>();
  async function makeProp(name: string) {
    const size = assets[`prop-${name}`];
    if (!size) throw new Error(`Missing prop ${name}`);
    const bone = await a.bone(`props/${name}`, camera, 0, 0),
      slot = await a.slot(`props/${name}`, bone);
    await a.region(slot, name, `prop-${name}`, 0, -size.height / 2, size.width, size.height);
    props.set(name, { bone, slot, ...size });
  }
  const propNames = [...new Set<string>(scene.frames.flatMap((f) => f.props.map((p) => p.name)))];
  for (const name of propNames.filter((n) => !['leaves', 'duck'].includes(n))) await makeProp(name);
  const shadows = new Map<string, string>();
  for (const name of names) {
    if (name === 'Pip' || (name === 'GeorgeClimb' && item.id === '10')) continue;
    const bone = await a.bone(`${name.toLowerCase()}/shadow`, camera, 0, 0);
    const slot = await a.slot(`${name.toLowerCase()}/shadow`, bone);
    await a.region(slot, 'shadow', 'shadow', 0, 0, 250, 36);
    shadows.set(name, bone);
  }
  const rigs = new Map<string, Rig>();
  const origins = new Map<string, { x: number; y: number; sx: number; sy: number }>();
  // Back-row adults are drawn first. Branch characters remain in front of the
  // rescue basket until its front rim is drawn at the end of the character pass.
  const order = names.sort((n1, n2) => {
    if (item.id === '10' && n1 === 'GeorgeClimb') return -1;
    if (item.id === '10' && n2 === 'GeorgeClimb') return 1;
    return first(n1).y - first(n2).y;
  });
  for (const name of order) {
    const c = cast.find((c) => c.name === name)!;
    if (!c) throw new Error(name);
    const initial = scene.frames[0]!.actors[name];
    const p = initial ?? first(name);
    const scale = (p.h * H) / c.height;
    const x = initial ? p.x * W : -4000,
      y = p.y * H;
    const r = await a.rig(c, camera, x, y, scale, !!p.flip);
    rigs.set(name, r);
    origins.set(name, { x, y, sx: p.flip ? -scale : scale, sy: scale });
  }
  for (const name of propNames.filter((n) => ['leaves', 'duck'].includes(n))) await makeProp(name);
  if (item.id === '10') {
    // The climbing SVG already includes the basket and both supporting paws.
    // Put its front rim and near paw over the kitten's lower body on entry.
    const george = rigs.get('GeorgeClimb')!;
    const count = (await a.call<{ slots: unknown[] }>('slot.list', { documentId: a.id })).slots
      .length;
    for (const n of ['basket-front', 'arm-near'])
      await a.call('slot.reorder', {
        documentId: a.id,
        slotId: george.slots[n],
        toIndex: count - 1,
      });
  }
  const titleBone = await a.bone('stage/titles', null, W / 2, H / 2),
    titleSlot = await a.slot('titles', titleBone);
  for (const name of ['title', 'end-card', 'location-card'])
    await a.region(titleSlot, name, name, 0, 0, W, H);
  await a.call('slot.activeAttachment', {
    documentId: a.id,
    slotId: titleSlot,
    attachment: scene.frames[0]!.title,
  });
  const animation = await a.animation('pilot', scene.duration);
  const tracks = new Map<string, { sample: number; key: number; value: unknown; json: string }>();
  async function key(
    bone: string,
    channel: string,
    t: number,
    value: unknown,
    curve: unknown = 'linear',
    force = false,
  ) {
    const name = bone + '/' + channel;
    const json = JSON.stringify(value),
      last = tracks.get(name);
    if (last && last.json === json && !force) {
      last.sample = t;
      return;
    }
    if (last && last.sample > last.key + 0.00001)
      await a.key(animation, bone, channel, last.sample, last.value, curve);
    await a.key(animation, bone, channel, t, value, curve);
    tracks.set(name, { sample: t, key: t, value, json });
  }
  const attachments = new Map<string, string | null>();
  const bgKeys: number[] = [];
  async function swap(slot: string, t: number, name: string | null) {
    if (attachments.has(slot) && attachments.get(slot) === name) return;
    await a.attachment(animation, slot, t, name);
    attachments.set(slot, name);
    if (slot === bgSlot) bgKeys.push(t);
  }
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const smooth = (v: number) => {
    v = clamp(v);
    return v * v * (3 - 2 * v);
  };
  function sourceX(name: string, t: number): number {
    const i = Math.max(0, Math.min(scene.frames.length - 1, Math.round(t * 12)));
    return scene.frames[i]!.actors[name]?.x ?? first(name).x;
  }
  for (let fi = 0; fi < scene.frames.length; fi++) {
    const f = scene.frames[fi]!,
      t = Math.min(scene.duration, f.t);
    const [cx, cy, z] = f.camera;
    await key(camera, 'translate', t, { x: -cx * W * z, y: -cy * H * z }, 'stepped');
    await key(camera, 'scale', t, { x: z, y: z }, 'stepped');
    await swap(bgSlot, t, f.set);
    await swap(titleSlot, t, f.title);
    for (const [name, r] of rigs) {
      const c = r.character,
        p = f.actors[name],
        origin = origins.get(name)!;
      const next = scene.frames[fi + 1]?.actors[name];
      const cut = !!p !== !!next && fi < scene.frames.length - 1;
      if (!p) {
        await key(r.root, 'translate', t, { x: -4000 - origin.x, y: 0 }, 'stepped', cut);
        continue;
      }
      const scale = (p.h * H) / c.height;
      await key(
        r.root,
        'translate',
        t,
        { x: p.x * W - origin.x, y: p.y * H - origin.y },
        cut ? 'stepped' : 'linear',
        cut,
      );
      await key(
        r.root,
        'scale',
        t,
        { x: (p.flip ? -scale : scale) / origin.sx, y: scale / origin.sy },
        'stepped',
      );
      await key(r.root, 'rotate', t, { angle: p.rootAngle ?? 0 });
      if (fi % 3 === 0 || fi === scene.frames.length - 1) {
        await key(r.bones.head!, 'rotate', t, { angle: p.headAngle ?? 0 });
        for (const ear of ['ear-near', 'ear-far'])
          if (r.bones[ear])
            await key(r.bones[ear]!, 'rotate', t, { angle: -0.6 * Math.sin(t * 2.1 + 0.25) });
      }
      if (fi % 2 === 0 || fi === scene.frames.length - 1) {
        if (r.bones.tail) await key(r.bones.tail, 'rotate', t, { angle: p.tailAngle ?? 0 });
        if (r.bones.wing) await key(r.bones.wing, 'rotate', t, { angle: 1.5 * Math.sin(t * 2) });
      }
      await key(r.bones.torso!, 'rotate', t, { angle: p.torsoAngle ?? 0 });
      if (fi % 4 === 0 || p.reach || p.rootAngle || p.carry || fi === scene.frames.length - 1)
        await key(r.bones.torso!, 'translate', t, { x: 0, y: (p.torsoY ?? 0) * c.height });
      for (const eye of ['eye-near', 'eye-far'])
        if (r.bones[eye]) await key(r.bones[eye]!, 'scale', t, { x: 1, y: p.blink ?? 1 });
      if (r.mouth)
        await swap(r.mouth, t, r.mouthNames[Math.min(p.mouth ?? 0, r.mouthNames.length - 1)]!);
      for (const [legName, leg] of Object.entries(r.legs)) {
        let dx = 0,
          dy = 0;
        if (p.walk || p.gait) {
          const period = 0.8,
            offset = ['front-near', 'back-far', 'foot-near'].includes(legName) ? 0 : 0.5;
          const phase = (t / period + offset) % 1,
            stance = 0.62;
          const cycleStart = t - phase * period;
          const sign = p.flip ? -1 : 1;
          const rootAt = (tt: number) => (sourceX(name, tt) * W) / scale / sign;
          const travel = rootAt(cycleStart + period) - rootAt(cycleStart);
          const land = travel * 0.4;
          if (phase < stance) dx = rootAt(cycleStart) - rootAt(t) + land;
          else {
            const u = (phase - stance) / (1 - stance);
            const from = rootAt(cycleStart) - rootAt(cycleStart + stance * period) + land;
            const to = rootAt(cycleStart + period) - rootAt(t) + land;
            dx = from + (to - from) * smooth(u);
            dy = -Math.sin(u * Math.PI) * c.height * 0.048;
          }
        }
        if (legName === 'front-near' && p.gesture) {
          dx -= c.width * 0.08 * p.gesture;
          dy -= c.height * 0.13 * p.gesture;
        }
        if (legName.startsWith('front-') && p.reach) {
          dx -= c.width * 0.05 * p.reach;
          dy -= c.height * 0.21 * p.reach;
        }
        if (p.carry && legName.startsWith('front-')) {
          const target = legName === 'front-near' ? [0.34, 0.58] : [0.23, 0.57];
          dx = target[0]! * c.width - leg.definition.foot[0];
          dy = target[1]! * c.height - leg.definition.foot[1];
        }
        if (p.carry && p.footY && legName in p.footY)
          dy = (p.footY[legName]! * H) / scale + (legName === 'back-far' ? 0.018 * c.height : 0);
        await key(leg.target, 'translate', t, {
          x: Math.round(dx * 100) / 100,
          y: Math.round(dy * 100) / 100,
        });
      }
      const shadow = shadows.get(name);
      if (shadow) {
        await key(shadow, 'translate', t, { x: p.y > 0.7 ? p.x * W : -4000, y: p.y * H });
        await key(shadow, 'scale', t, { x: (p.h * H * 0.64) / 250, y: (p.h * H * 0.07) / 36 });
      }
    }
    for (const [name, prop] of props) {
      const p = f.props.find((p) => p.name === name);
      if (!p) {
        await swap(prop.slot, t, null);
        continue;
      }
      await swap(prop.slot, t, name);
      await key(prop.bone, 'translate', t, { x: p.x * W, y: p.y * H });
      await key(prop.bone, 'scale', t, { x: (p.h * H) / prop.height, y: (p.h * H) / prop.height });
    }
  }
  await a.save(`scenes/Scene-${item.id}.armature.json`);
  // The offline renderer composites the unchanged background using FFmpeg.
  // This keeps the native rig solve and alpha drawing identical while avoiding
  // bilinear resampling millions of static background pixels on every frame.
  for (const t of bgKeys) await a.attachment(animation, bgSlot, t, null);
  await a.save(`render-input/Scene-${item.id}.foreground.armature.json`);
  await a.close();
  console.log(
    `Authored scene ${item.id}: ${names.length} rigs, ${scene.duration.toFixed(2)} seconds, ${a.edits} native commands`,
  );
}
