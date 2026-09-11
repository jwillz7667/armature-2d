import type { ReactElement } from 'react';
import type {
  RangeF,
  EmitterShape,
  SpawnConfig,
  ParticleTexture,
} from '@marionette/format/effects-types';
import {
  documentHost,
  SetLayerFieldCommand,
  SetEmitterTrailCommand,
  type EffectId,
  type EffectLayerEntity,
  type EffectLayerBody,
} from '../document';
import {
  ChoiceInput,
  Group,
  NumberInput,
  TextInput,
  ToggleInput,
  useAuthoringError,
} from './authoring-fields';

export function EffectLayerEditor({
  effectId,
  layer,
}: {
  effectId: EffectId;
  layer: EffectLayerEntity;
}): ReactElement {
  const { error, run } = useAuthoringError();
  const body = layer.body;
  const regions = documentHost
    .current()
    .effects.atlas()
    .pages.flatMap((p) => p.regions.map((r) => r.name));
  const set = (field: string, next: EffectLayerBody) =>
    run(() =>
      documentHost
        .current()
        .history.execute(new SetLayerFieldCommand(effectId, layer.id, field, next)),
    );
  if (body.type === 'spriteAnimator')
    return (
      <Group title="Sprite animation" open>
        {error}
        <RegionInput
          value={body.region}
          regions={regions}
          onChange={(region) => set('region', { ...body, region })}
        />
        <ChoiceInput
          label="Anchor space"
          value={body.anchorSpace}
          choices={['world', 'screen']}
          onChange={(anchorSpace) => set('anchorSpace', { ...body, anchorSpace })}
        />
        <NumberInput
          label="Rotation per second"
          value={body.rotationDegPerSec}
          onChange={(rotationDegPerSec) => set('rotationDegPerSec', { ...body, rotationDegPerSec })}
        />
        <NumberInput
          label="Duration (seconds)"
          value={body.layerDuration}
          min={0.001}
          onChange={(layerDuration) => set('layerDuration', { ...body, layerDuration })}
        />
        <ToggleInput
          label="Loop"
          value={body.loop}
          onChange={(loop) => set('loop', { ...body, loop })}
        />
      </Group>
    );
  if (body.type === 'ribbonTrail')
    return (
      <Group title="Ribbon" open>
        {error}
        <RegionInput
          value={body.region}
          regions={regions}
          onChange={(region) => set('region', { ...body, region })}
        />
        <TextInput
          label="Anchor reference"
          value={body.anchorRef}
          onChange={(anchorRef) => set('anchorRef', { ...body, anchorRef })}
        />
        <NumberInput
          label="Segment capacity"
          value={body.maxSegments}
          min={1}
          max={4096}
          step={1}
          onChange={(maxSegments) => set('maxSegments', { ...body, maxSegments })}
        />
        <NumberInput
          label="Segment spacing"
          value={body.segmentSpacing}
          min={0.001}
          onChange={(segmentSpacing) => set('segmentSpacing', { ...body, segmentSpacing })}
        />
      </Group>
    );
  const trail = body.trail;
  const setTrail = (value: typeof body.trail) =>
    run(() =>
      documentHost.current().history.execute(new SetEmitterTrailCommand(effectId, layer.id, value)),
    );
  return (
    <div>
      {error}
      <Group title="Emission" open>
        <NumberInput
          label="Particle capacity"
          value={body.maxParticles}
          min={1}
          max={100000}
          step={1}
          onChange={(maxParticles) => set('maxParticles', { ...body, maxParticles })}
        />
        <SpawnEditor value={body.spawn} onChange={(spawn) => set('spawn', { ...body, spawn })} />
        <ShapeEditor value={body.shape} onChange={(shape) => set('shape', { ...body, shape })} />
      </Group>
      <Group title="Initial particle values">
        {(
          [
            'lifetime',
            'startSpeed',
            'emissionAngle',
            'startRotation',
            'angularVelocity',
            'startScale',
          ] as const
        ).map((field) => (
          <RangeInput
            key={field}
            label={field}
            value={body[field]}
            onChange={(value) => set(field, { ...body, [field]: value })}
          />
        ))}
      </Group>
      <Group title="Forces">
        {(['gravity', 'acceleration'] as const).map((field) => (
          <Group key={field} title={field}>
            {(['x', 'y'] as const).map((axis) => (
              <NumberInput
                key={axis}
                label={axis}
                value={body[field][axis]}
                onChange={(value) =>
                  set(field, { ...body, [field]: { ...body[field], [axis]: value } })
                }
              />
            ))}
          </Group>
        ))}
        <NumberInput
          label="Drag"
          value={body.drag}
          min={0}
          onChange={(drag) => set('drag', { ...body, drag })}
        />
      </Group>
      <Group title="Particle texture" open>
        <TextureEditor
          value={body.texture}
          regions={regions}
          onChange={(texture) => set('texture', { ...body, texture })}
        />
      </Group>
      <Group title="Particle trails">
        <ToggleInput
          label="Enable trails"
          value={trail !== null}
          onChange={(enabled) =>
            setTrail(
              enabled
                ? { region: regions[0] ?? 'particle', maxSegments: 16, segmentSpacing: 4 }
                : null,
            )
          }
        />
        {trail !== null && (
          <>
            <RegionInput
              value={trail.region}
              regions={regions}
              onChange={(region) => setTrail({ ...trail, region })}
            />
            <NumberInput
              label="Segment capacity"
              value={trail.maxSegments}
              min={1}
              max={4096}
              step={1}
              onChange={(maxSegments) => setTrail({ ...trail, maxSegments })}
            />
            <NumberInput
              label="Segment spacing"
              value={trail.segmentSpacing}
              min={0.001}
              onChange={(segmentSpacing) => setTrail({ ...trail, segmentSpacing })}
            />
          </>
        )}
      </Group>
    </div>
  );
}

function RegionInput({
  value,
  regions,
  onChange,
}: {
  value: string;
  regions: readonly string[];
  onChange: (region: string) => void;
}): ReactElement {
  return (
    <ChoiceInput
      label="Texture region"
      value={value}
      choices={regions.includes(value) ? regions : [value, ...regions]}
      onChange={onChange}
    />
  );
}

function RangeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: RangeF;
  onChange: (range: RangeF) => void;
}): ReactElement {
  return (
    <Group title={label}>
      <NumberInput
        label="Minimum"
        value={value.min}
        max={value.max}
        onChange={(min) => onChange({ ...value, min })}
      />
      <NumberInput
        label="Maximum"
        value={value.max}
        min={value.min}
        onChange={(max) => onChange({ ...value, max })}
      />
    </Group>
  );
}

function SpawnEditor({
  value,
  onChange,
}: {
  value: SpawnConfig;
  onChange: (spawn: SpawnConfig) => void;
}): ReactElement {
  const { error, run } = useAuthoringError();
  const bursts = value.mode === 'bursts' ? value.bursts : [];
  const setBursts = (next: typeof bursts) =>
    run(() => {
      const sorted = [...next].sort((a, b) => a.atTime - b.atTime);
      if (sorted.some((burst, i) => i > 0 && burst.atTime === sorted[i - 1]!.atTime))
        throw new Error('Each burst needs a different start time.');
      onChange({ mode: 'bursts', bursts: sorted });
    });
  return (
    <div>
      {error}
      <ChoiceInput
        label="Spawn schedule"
        value={value.mode}
        choices={['rate', 'burst', 'bursts']}
        onChange={(mode) =>
          onChange(
            mode === 'rate'
              ? { mode, particlesPerSecond: 20 }
              : mode === 'burst'
                ? { mode, count: 20, atTime: 0 }
                : { mode, bursts: [{ atTime: 0, count: 20 }] },
          )
        }
      />
      {value.mode === 'rate' && (
        <NumberInput
          label="Particles per second"
          value={value.particlesPerSecond}
          min={0}
          max={100000}
          onChange={(particlesPerSecond) => onChange({ ...value, particlesPerSecond })}
        />
      )}
      {value.mode === 'burst' && (
        <>
          <NumberInput
            label="Count"
            value={value.count}
            min={0}
            max={100000}
            step={1}
            onChange={(count) => onChange({ ...value, count })}
          />
          <NumberInput
            label="Start (seconds)"
            value={value.atTime}
            min={0}
            onChange={(atTime) => onChange({ ...value, atTime })}
          />
        </>
      )}
      {value.mode === 'bursts' && (
        <>
          {bursts.map((burst, index) => (
            <Group key={index} title={`Burst ${index + 1}`}>
              <NumberInput
                label="Start (seconds)"
                value={burst.atTime}
                min={0}
                onChange={(atTime) =>
                  setBursts(bursts.map((b, i) => (i === index ? { ...b, atTime } : b)))
                }
              />
              <NumberInput
                label="Count"
                value={burst.count}
                min={0}
                max={100000}
                step={1}
                onChange={(count) =>
                  setBursts(bursts.map((b, i) => (i === index ? { ...b, count } : b)))
                }
              />
              <button
                type="button"
                disabled={bursts.length <= 1}
                onClick={() => setBursts(bursts.filter((_, i) => i !== index))}
              >
                Remove burst
              </button>
            </Group>
          ))}
          <button
            type="button"
            onClick={() =>
              setBursts([...bursts, { atTime: (bursts.at(-1)?.atTime ?? 0) + 1, count: 20 }])
            }
          >
            Add burst
          </button>
        </>
      )}
    </div>
  );
}

function ShapeEditor({
  value,
  onChange,
}: {
  value: EmitterShape;
  onChange: (shape: EmitterShape) => void;
}): ReactElement {
  return (
    <div>
      <ChoiceInput
        label="Spawn shape"
        value={value.kind}
        choices={['point', 'line', 'circle', 'rect']}
        onChange={(kind) =>
          onChange(
            kind === 'point'
              ? { kind }
              : kind === 'line'
                ? { kind, x1: -50, y1: 0, x2: 50, y2: 0 }
                : kind === 'circle'
                  ? { kind, radius: 50, edgeOnly: false }
                  : { kind, width: 100, height: 100 },
          )
        }
      />
      {value.kind === 'line' &&
        (['x1', 'y1', 'x2', 'y2'] as const).map((field) => (
          <NumberInput
            key={field}
            label={field}
            value={value[field]}
            onChange={(v) => onChange({ ...value, [field]: v })}
          />
        ))}
      {value.kind === 'circle' && (
        <>
          <NumberInput
            label="Radius"
            value={value.radius}
            min={0}
            onChange={(radius) => onChange({ ...value, radius })}
          />
          <ToggleInput
            label="Edge only"
            value={value.edgeOnly}
            onChange={(edgeOnly) => onChange({ ...value, edgeOnly })}
          />
        </>
      )}
      {value.kind === 'rect' &&
        (['width', 'height'] as const).map((field) => (
          <NumberInput
            key={field}
            label={field}
            value={value[field]}
            min={0}
            onChange={(v) => onChange({ ...value, [field]: v })}
          />
        ))}
    </div>
  );
}

function TextureEditor({
  value,
  regions,
  onChange,
}: {
  value: ParticleTexture;
  regions: readonly string[];
  onChange: (texture: ParticleTexture) => void;
}): ReactElement {
  const first = value.kind === 'static' ? value.region : value.regions[0]!;
  return (
    <div>
      <ChoiceInput
        label="Texture mode"
        value={value.kind}
        choices={['static', 'animated']}
        onChange={(kind) =>
          onChange(
            kind === 'static'
              ? { kind, region: first }
              : { kind, regions: [first], fps: 12, mode: 'loop' },
          )
        }
      />
      {value.kind === 'static' ? (
        <RegionInput
          value={value.region}
          regions={regions}
          onChange={(region) => onChange({ ...value, region })}
        />
      ) : (
        <>
          <ChoiceInput
            label="Playback"
            value={value.mode}
            choices={['loop', 'overLife', 'once']}
            onChange={(mode) => onChange({ ...value, mode })}
          />
          <NumberInput
            label="Frames per second"
            value={value.fps}
            min={0.001}
            onChange={(fps) => onChange({ ...value, fps })}
          />
          {value.regions.map((region, index) => (
            <Group key={index} title={`Frame ${index + 1}`}>
              <RegionInput
                value={region}
                regions={regions}
                onChange={(next) =>
                  onChange({
                    ...value,
                    regions: value.regions.map((r, i) => (i === index ? next : r)),
                  })
                }
              />
              <button
                type="button"
                disabled={value.regions.length <= 1}
                onClick={() =>
                  onChange({ ...value, regions: value.regions.filter((_, i) => i !== index) })
                }
              >
                Remove frame
              </button>
            </Group>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...value, regions: [...value.regions, regions[0] ?? first] })}
          >
            Add frame
          </button>
        </>
      )}
    </div>
  );
}
