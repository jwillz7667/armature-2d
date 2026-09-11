import type { ReactElement } from 'react';
import { evalLifeCurveNumber, prepareLifeCurveNumber } from '@marionette/runtime-core';
import {
  AddLifeStopCommand,
  MoveLifeStopCommand,
  RemoveLifeStopCommand,
  SetLifeStopCurveCommand,
  SetLifeStopValueCommand,
  documentHost,
  type EffectId,
  type EffectLayerEntity,
  type EffectLifeCurveEntity,
  type LifeCurveField,
} from '../document';
import { CurveInput, Group, NumberInput, fieldLabel, useAuthoringError } from './authoring-fields';

export function EffectLifeCurves({
  effectId,
  layer,
}: {
  effectId: EffectId;
  layer: EffectLayerEntity;
}): ReactElement {
  const { error, run } = useAuthoringError();
  return (
    <div>
      {error}
      {[...layer.curves].map(([field, curve]) => (
        <Group key={field} title={fieldLabel(field)}>
          <LifePlot curve={curve} label={fieldLabel(field)} />
          {curve.stops.map((stop, index) => {
            const endpoint = index === 0 || index === curve.stops.length - 1;
            return (
              <Group key={stop.id} title={`${Math.round(stop.t * 100)}%`}>
                <NumberInput
                  label="Life position"
                  value={stop.t}
                  disabled={endpoint}
                  min={0.000001}
                  max={0.999999}
                  onChange={(value) =>
                    run(() =>
                      documentHost
                        .current()
                        .history.execute(
                          new MoveLifeStopCommand(effectId, layer.id, stop.id, value),
                        ),
                    )
                  }
                />
                {typeof stop.value === 'number' ? (
                  <NumberInput
                    label="Value"
                    value={stop.value}
                    min={0}
                    {...(field.toLowerCase().includes('alpha') ? { max: 1 } : {})}
                    onChange={(value) =>
                      run(() =>
                        documentHost
                          .current()
                          .history.execute(
                            new SetLifeStopValueCommand(effectId, layer.id, stop.id, value),
                          ),
                      )
                    }
                  />
                ) : (
                  (['r', 'g', 'b'] as const).map((channel) => (
                    <NumberInput
                      key={channel}
                      label={channel}
                      value={typeof stop.value === 'number' ? 0 : stop.value[channel]}
                      min={0}
                      max={1}
                      onChange={(value) =>
                        run(() => {
                          if (typeof stop.value !== 'number')
                            documentHost.current().history.execute(
                              new SetLifeStopValueCommand(effectId, layer.id, stop.id, {
                                ...stop.value,
                                [channel]: value,
                              }),
                            );
                        })
                      }
                    />
                  ))
                )}
                {!endpoint || index === 0 ? (
                  <CurveInput
                    curve={stop.curve}
                    onChange={(value) =>
                      run(() =>
                        documentHost
                          .current()
                          .history.execute(
                            new SetLifeStopCurveCommand(effectId, layer.id, stop.id, value),
                          ),
                      )
                    }
                  />
                ) : null}
                {!endpoint && (
                  <button
                    type="button"
                    onClick={() =>
                      run(() =>
                        documentHost
                          .current()
                          .history.execute(new RemoveLifeStopCommand(effectId, layer.id, stop.id)),
                      )
                    }
                  >
                    Remove stop
                  </button>
                )}
              </Group>
            );
          })}
          <button
            type="button"
            onClick={() => run(() => addMidpoint(effectId, layer, field, curve))}
          >
            Add stop
          </button>
        </Group>
      ))}
    </div>
  );
}

function addMidpoint(
  effectId: EffectId,
  layer: EffectLayerEntity,
  field: LifeCurveField,
  curve: EffectLifeCurveEntity,
): void {
  let index = 0;
  for (let i = 1; i + 1 < curve.stops.length; ++i)
    if (
      curve.stops[i + 1]!.t - curve.stops[i]!.t >
      curve.stops[index + 1]!.t - curve.stops[index]!.t
    )
      index = i;
  const left = curve.stops[index]!;
  const right = curve.stops[index + 1]!;
  const t = (left.t + right.t) / 2;
  const value =
    typeof left.value === 'number' && typeof right.value === 'number'
      ? (left.value + right.value) / 2
      : typeof left.value !== 'number' && typeof right.value !== 'number'
        ? {
            r: (left.value.r + right.value.r) / 2,
            g: (left.value.g + right.value.g) / 2,
            b: (left.value.b + right.value.b) / 2,
          }
        : left.value;
  documentHost
    .current()
    .history.execute(new AddLifeStopCommand(effectId, layer.id, field, t, value, 'linear'));
}

// Display the runtime's actual easing, including overshoot, rather than drawing straight lines
// between Bezier keys. This preview allocates only when React renders a changed curve.
function LifePlot({ curve, label }: { curve: EffectLifeCurveEntity; label: string }): ReactElement {
  const channels =
    typeof curve.stops[0]?.value === 'number' ? (['value'] as const) : (['r', 'g', 'b'] as const);
  const samples = channels.map((channel) => {
    const prepared = prepareLifeCurveNumber({
      stops: curve.stops.map((stop) => ({
        t: stop.t,
        curve: stop.curve,
        value:
          typeof stop.value === 'number'
            ? stop.value
            : channel === 'value'
              ? 0
              : stop.value[channel],
      })),
    });
    return Array.from({ length: 65 }, (_, i) => evalLifeCurveNumber(prepared, i / 64));
  });
  const min = Math.min(0, ...samples.flat());
  const max = Math.max(1, ...samples.flat());
  const colors = channels.length === 1 ? ['#8cbbff'] : ['#ff9595', '#8ee0a2', '#8cbbff'];
  return (
    <svg
      role="img"
      aria-label={`${label} from 0 to 100 percent`}
      viewBox="0 0 240 72"
      style={{ width: '100%', height: 72, background: '#17202b', borderRadius: 4 }}
    >
      {samples.map((values, index) => (
        <polyline
          key={index}
          fill="none"
          stroke={colors[index]}
          strokeWidth={2}
          points={values
            .map((value, i) => `${8 + (i * 224) / 64},${64 - ((value - min) * 56) / (max - min)}`)
            .join(' ')}
        />
      ))}
    </svg>
  );
}
