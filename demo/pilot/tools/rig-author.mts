import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  createNodeFileStore,
  SessionRegistry,
  TOOLS,
  type ToolDeps,
} from '../../../packages/mcp-server/src/index';

// Every document edit uses Armature's public MCP handlers and command history.
// No SkeletonDocument JSON is constructed or patched by this production script.
export type Vec = [number, number];
export interface Part {
  id: string;
  region: string;
  box: [number, number, number, number];
  pivot: Vec;
  parent: string;
  visible: boolean;
  mouthState?: number;
  leg?: string;
  segment?: 'upper' | 'lower' | 'paw';
  gazeRange?: Vec;
}
export interface Leg {
  id: string;
  hip: Vec;
  knee: Vec;
  foot: Vec;
}
export interface Character {
  name: string;
  width: number;
  height: number;
  torsoPivot: Vec;
  headPivot: Vec;
  parts: Part[];
  legs: Leg[];
}
export interface Rig {
  character: Character;
  root: string;
  bones: Record<string, string>;
  points: Record<string, Vec>;
  slots: Record<string, string>;
  legs: Record<string, { upper: string; lower: string; target: string; definition: Leg }>;
  mouth: string;
  mouthNames: string[];
}
export const linear = 'linear';
export const ease = { type: 'bezier', cx1: 0.42, cy1: 0, cx2: 0.58, cy2: 1 };
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const dist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const angle = (a: Vec, b: Vec) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const clamp = (v: number) => Math.max(0, Math.min(1, v));

export class Author {
  readonly deps: ToolDeps;
  readonly tools = new Map(TOOLS.map((t) => [t.name, t]));
  id = '';
  edits = 0;
  constructor(readonly root: string) {
    this.deps = { sessions: new SessionRegistry(), files: createNodeFileStore(root) };
  }
  async call<T = Record<string, unknown>>(
    name: string,
    input: Record<string, unknown> = {},
  ): Promise<T> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(name);
    // The selected public handler validates its input and supplies the typed
    // response declared by its schema. Demo callers name fields they consume.
    try {
      this.edits++;
      return (await tool.handler(this.deps, input)) as T;
    } catch (e) {
      throw new Error(
        `${name}: ${e instanceof Error ? e.message : String(e)} (${JSON.stringify(input).slice(0, 180)})`,
        { cause: e },
      );
    }
  }
  async new(name: string, atlas: unknown) {
    this.id = (await this.call<{ documentId: string }>('document.new', { name })).documentId;
    await this.call('atlas.set', { documentId: this.id, atlas });
    await this.call('document.setMetadata', {
      documentId: this.id,
      fps: 24,
      imagesPath: 'source-layers',
      audioPath: 'audio',
    });
  }
  async bone(
    name: string,
    parentId: string | null,
    x: number,
    y: number,
    options: Record<string, unknown> = {},
  ) {
    return (
      await this.call<{ boneId: string }>('bone.create', {
        documentId: this.id,
        name,
        parentId,
        x,
        y,
        ...options,
      })
    ).boneId;
  }
  async slot(name: string, boneId: string) {
    return (
      await this.call<{ slotId: string }>('slot.create', { documentId: this.id, name, boneId })
    ).slotId;
  }
  async region(
    slotId: string,
    name: string,
    path: string,
    x: number,
    y: number,
    width: number,
    height: number,
    rotation = 0,
  ) {
    await this.call('attach.region.add', {
      documentId: this.id,
      slotId,
      name,
      path,
      x,
      y,
      width,
      height,
      rotation,
    });
    await this.call('slot.activeAttachment', { documentId: this.id, slotId, attachment: name });
  }
  async animation(name: string, duration: number) {
    return (
      await this.call<{ animationId: string }>('anim.create', {
        documentId: this.id,
        name,
        duration,
      })
    ).animationId;
  }
  async key(
    animationId: string,
    boneId: string,
    channel: string,
    time: number,
    value: unknown,
    curve: unknown = linear,
  ) {
    await this.call('kf.set', {
      documentId: this.id,
      animationId,
      boneId,
      channel,
      time,
      value,
      curve,
    });
  }
  async attachment(animationId: string, slotId: string, time: number, name: string | null) {
    await this.call('kf.attachment.set', { documentId: this.id, animationId, slotId, time, name });
  }
  async save(path: string) {
    await this.call('document.validate', { documentId: this.id });
    await this.call('document.save', { documentId: this.id, path });
  }
  async close() {
    await this.call('document.close', { documentId: this.id });
  }
  async rig(
    c: Character,
    parent: string | null = null,
    x = 0,
    y = 0,
    scale = 1,
    flip = false,
  ): Promise<Rig> {
    const prefix = c.name.toLowerCase();
    const rig: Rig = {
      character: c,
      root: '',
      bones: {},
      points: {},
      slots: {},
      legs: {},
      mouth: '',
      mouthNames: [],
    };
    rig.points.root = [c.width / 2, c.height];
    rig.root = await this.bone(`${prefix}/root`, parent, x, y, {
      scaleX: flip ? -scale : scale,
      scaleY: scale,
    });
    rig.bones.root = rig.root;
    const addBone = async (name: string, point: Vec, parentName: string) => {
      const d = sub(point, rig.points[parentName]!);
      rig.bones[name] = await this.bone(`${prefix}/${name}`, rig.bones[parentName]!, d[0], d[1]);
      rig.points[name] = point;
    };
    await addBone('torso', c.torsoPivot, 'root');
    await addBone('head', c.headPivot, 'torso');
    for (const p of c.parts) {
      if (
        p.id === 'head' ||
        p.id === 'torso' ||
        p.id.startsWith('leg-') ||
        p.id.startsWith('mouth-')
      )
        continue;
      await addBone(p.id, p.pivot, p.parent);
    }
    for (const leg of c.legs) {
      const a1 = angle(leg.hip, leg.knee),
        a2 = angle(leg.knee, leg.foot);
      const d = sub(leg.hip, c.torsoPivot);
      const upper = await this.bone(`${prefix}/${leg.id}/upper`, rig.bones.torso!, d[0], d[1], {
        rotation: a1,
        length: dist(leg.hip, leg.knee),
      });
      const lower = await this.bone(
        `${prefix}/${leg.id}/lower`,
        upper,
        dist(leg.hip, leg.knee),
        0,
        { rotation: a2 - a1, length: dist(leg.knee, leg.foot) },
      );
      const f = sub(leg.foot, rig.points.root!);
      const target = await this.bone(`${prefix}/${leg.id}/foot-control`, rig.root, f[0], f[1]);
      // The runtime's positive IK bend uses its mathematical convention; the
      // source artwork is y-down, so the setup elbow sign is reversed here.
      await this.call('ik.createConstraint', {
        documentId: this.id,
        name: `${prefix}/${leg.id}/ik`,
        boneIds: [upper, lower],
        targetId: target,
        mix: 1,
        bendPositive: a2 - a1 < 0,
      });
      rig.legs[leg.id] = { upper, lower, target, definition: leg };
    }
    for (const p of c.parts) {
      if (p.leg && p.segment) {
        const leg = rig.legs[p.leg]!;
        const point =
          p.segment === 'upper'
            ? leg.definition.hip
            : p.segment === 'lower'
              ? leg.definition.knee
              : leg.definition.foot;
        const theta =
          p.segment === 'upper'
            ? angle(leg.definition.hip, leg.definition.knee)
            : p.segment === 'lower'
              ? angle(leg.definition.knee, leg.definition.foot)
              : 0;
        const bone =
          p.segment === 'upper' ? leg.upper : p.segment === 'lower' ? leg.lower : leg.target;
        const [left, top, right, bottom] = p.box;
        const dx = (left + right) / 2 - point[0],
          dy = (top + bottom) / 2 - point[1];
        const radians = (theta * Math.PI) / 180;
        const slot = await this.slot(`${prefix}/${p.id}`, bone);
        rig.slots[p.id] = slot;
        await this.region(
          slot,
          p.id,
          p.region,
          dx * Math.cos(radians) + dy * Math.sin(radians),
          -dx * Math.sin(radians) + dy * Math.cos(radians),
          right - left,
          bottom - top,
          -theta,
        );
        continue;
      }
      if (p.id.startsWith('mouth-')) {
        if (!rig.mouth) rig.mouth = await this.slot(`${prefix}/mouth`, rig.bones.head!);
        const [l, t, r, b] = p.box;
        await this.region(
          rig.mouth,
          p.id,
          p.region,
          (l + r) / 2 - c.headPivot[0],
          (t + b) / 2 - c.headPivot[1],
          r - l,
          b - t,
        );
        rig.mouthNames.push(p.id);
        continue;
      }
      const leg = p.id.startsWith('leg-') ? rig.legs[p.id.slice(4)] : undefined;
      const boneId = leg ? rig.root : rig.bones[p.id]!;
      const origin = leg ? rig.points.root! : rig.points[p.id]!;
      const slotId = await this.slot(`${prefix}/${p.id}`, boneId);
      rig.slots[p.id] = slotId;
      const [l, t, r, b] = p.box;
      await this.region(
        slotId,
        p.id,
        p.region,
        (l + r) / 2 - origin[0],
        (t + b) / 2 - origin[1],
        r - l,
        b - t,
      );
      if (p.id.startsWith('lid-'))
        await this.call('slot.activeAttachment', { documentId: this.id, slotId, attachment: null });
      if (!leg) continue;
      const grid = meshGrid(l - origin[0], t - origin[1], r - l, b - t, 10, 18);
      await this.call('mesh.generateFromRegion', {
        documentId: this.id,
        slotId,
        name: p.id,
        ...grid,
        width: r - l,
        height: b - t,
      });
      await this.call('mesh.bindToBones', {
        documentId: this.id,
        slotId,
        name: p.id,
        boneIds: [leg.upper, leg.lower, leg.target],
        weightMode: 'rigidNearest',
      });
      const indices = grid.vertices
        .filter((_, i) => i % 2 === 1)
        .map((yy, vertexIndex) => ({ yy: yy + origin[1], vertexIndex }));
      await this.call('mesh.paintWeight', {
        documentId: this.id,
        slotId,
        name: p.id,
        activeBoneId: leg.upper,
        mode: 'add',
        dabs: indices.map(({ vertexIndex }) => ({ vertexIndex, deltaWeight: 1 })),
      });
      const knee = leg.definition.knee[1],
        sole = leg.definition.foot[1];
      const span = Math.max(8, (sole - leg.definition.hip[1]) * 0.2);
      const kd = indices
        .map(({ yy, vertexIndex }) => ({
          vertexIndex,
          deltaWeight: clamp((yy - (knee - span / 2)) / span),
        }))
        .filter((d) => d.deltaWeight > 0);
      const fd = indices
        .map(({ yy, vertexIndex }) => ({
          vertexIndex,
          deltaWeight: clamp((yy - (sole - span * 0.85)) / (span * 0.6)),
        }))
        .filter((d) => d.deltaWeight > 0);
      if (kd.length)
        await this.call('mesh.paintWeight', {
          documentId: this.id,
          slotId,
          name: p.id,
          activeBoneId: leg.lower,
          mode: 'add',
          dabs: kd,
        });
      if (fd.length)
        await this.call('mesh.paintWeight', {
          documentId: this.id,
          slotId,
          name: p.id,
          activeBoneId: leg.target,
          mode: 'add',
          dabs: fd,
        });
    }
    if (rig.mouth)
      await this.call('slot.activeAttachment', {
        documentId: this.id,
        slotId: rig.mouth,
        attachment: rig.mouthNames[0],
      });
    return rig;
  }
}

// Boundary vertices come first, as required by the native mesh format.
export function meshGrid(x: number, y: number, w: number, h: number, cols: number, rows: number) {
  const points: Vec[] = [];
  const index = new Map<string, number>();
  const add = (c: number, r: number) => {
    const key = `${c},${r}`;
    if (!index.has(key)) {
      index.set(key, points.length);
      points.push([c, r]);
    }
  };
  for (let c = 0; c <= cols; c++) add(c, 0);
  for (let r = 1; r <= rows; r++) add(cols, r);
  for (let c = cols - 1; c >= 0; c--) add(c, rows);
  for (let r = rows - 1; r > 0; r--) add(0, r);
  const hullLength = points.length;
  for (let r = 1; r < rows; r++) for (let c = 1; c < cols; c++) add(c, r);
  const triangles: number[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const a = index.get(`${c},${r}`)!,
        b = index.get(`${c + 1},${r}`)!,
        cc = index.get(`${c},${r + 1}`)!,
        d = index.get(`${c + 1},${r + 1}`)!;
      triangles.push(a, b, cc, b, d, cc);
    }
  return {
    uvs: points.flatMap(([c, r]) => [c / cols, r / rows]),
    vertices: points.flatMap(([c, r]) => [x + (c / cols) * w, y + (r / rows) * h]),
    triangles,
    hullLength,
  };
}

export async function authorRigLibrary(root: string) {
  const cast = JSON.parse(readFileSync(join(root, 'cast-assets.json'), 'utf8')) as Character[];
  const atlas = JSON.parse(readFileSync(join(root, 'atlas.json'), 'utf8'));
  mkdirSync(join(root, 'rigs'), { recursive: true });
  for (const c of cast) {
    const a = new Author(root);
    await a.new(c.name, atlas);
    const r = await a.rig(c);
    for (const clip of ['idle', 'talk', 'walk', 'look-up', 'point']) {
      const duration = clip === 'walk' ? 1.2 : 3;
      const id = await a.animation(clip, duration);
      for (let i = 0; i <= Math.round(duration * 12); i++) {
        const t = i / 12;
        const theta =
          (clip === 'talk' ? 3 : 1) * Math.sin(t * Math.PI * 1.2) + (clip === 'look-up' ? 8 : 0);
        await a.key(id, r.bones.head!, 'rotate', t, { angle: theta });
        if (r.bones.tail)
          await a.key(id, r.bones.tail, 'rotate', t, { angle: 7 * Math.sin(t * Math.PI * 3) });
        if (clip === 'walk') {
          await a.key(id, r.bones.torso!, 'translate', t, {
            x: 0,
            y: -1.4 * Math.sin((t / 1.2) * Math.PI * 4),
          });
          for (const [n, leg] of Object.entries(r.legs)) {
            const phase =
              (t / 1.2 + (['front-near', 'back-far', 'foot-near'].includes(n) ? 0 : 0.5)) % 1;
            const stance = 0.62;
            const u = phase < stance ? phase / stance : (phase - stance) / (1 - stance);
            const dx = phase < stance ? -1 + 2 * u : 1 - 2 * (u * u * (3 - 2 * u));
            await a.key(id, leg.target, 'translate', t, {
              x: dx * c.width * 0.065,
              y: phase < stance ? 0 : -Math.sin(u * Math.PI) * c.height * 0.05,
            });
          }
        }
      }
      for (const eye of ['eye-near', 'eye-far'])
        if (r.bones[eye]) {
          for (const [time, y] of [
            [0, 1],
            [0.85, 1],
            [0.93, 0.04],
            [1.03, 1],
            [duration, 1],
          ] as const)
            if (time <= duration) {
              await a.key(id, r.bones[eye]!, 'scale', time, { x: 1, y });
              const side = eye.slice(4),
                closed = y < 0.2;
              for (const part of [eye, 'pupil-' + side, 'lid-' + side]) {
                if (r.slots[part])
                  await a.attachment(
                    id,
                    r.slots[part]!,
                    time,
                    part.startsWith('lid-') ? (closed ? part : null) : closed ? null : part,
                  );
              }
            }
        }
      if (clip === 'talk' && r.mouthNames.length > 1)
        for (let i = 0; i < 18; i++)
          await a.attachment(
            id,
            r.mouth,
            i / 6,
            r.mouthNames[i % 3 === 0 ? 0 : Math.min(1 + (i % 2), r.mouthNames.length - 1)]!,
          );
      if (clip === 'point') {
        const leg = r.legs['front-near'];
        if (leg)
          for (const [time, k] of [
            [0, 0],
            [0.5, 0],
            [1, 1],
            [2.4, 1],
            [3, 0],
          ] as const)
            await a.key(
              id,
              leg.target,
              'translate',
              time,
              { x: -c.width * 0.1 * k, y: -c.height * 0.17 * k },
              ease,
            );
      }
    }
    await a.save(`rigs/${c.name}.armature.json`);
    await a.close();
    console.log(
      `Rigged ${c.name}: ${c.legs.length} IK chains, ${c.parts.length} SVG parts, ${a.edits} commands`,
    );
  }
}

if (process.argv[1]?.endsWith('rig-author.mts')) {
  const root = process.env.ARMATURE_PILOT_DIR;
  if (!root) throw new Error('Set ARMATURE_PILOT_DIR');
  await authorRigLibrary(root);
}
