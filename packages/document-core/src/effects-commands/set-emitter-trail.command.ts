import type { Command, CommandContext } from '../command/command';
import { CommandNotAppliedError, EffectEditError } from '../command/errors';
import {
  makeLifeStop,
  type EffectLayerEntity,
  type EmitterLayerBody,
} from '../effects-model/effects-state';
import type { EffectId, EffectLayerId } from '../model/ids';
import type { EffectCommandSpec } from './effects-spec';

// A trail and its two lifetime curves are one structural edit. Preserve the layer and stop identities
// when editing an existing trail; a disabled trail releases only its own curves. One undo restores all.
export class SetEmitterTrailCommand implements Command {
  readonly kind = 'effect.layer.trail';
  readonly label = 'Set Particle Trail';
  private before: EffectLayerEntity | undefined;
  private after: EffectLayerEntity | undefined;
  private index = 0;
  constructor(
    private readonly effectId: EffectId,
    private readonly layerId: EffectLayerId,
    private readonly trail: EmitterLayerBody['trail'],
  ) {}
  do(ctx: CommandContext): void {
    if (this.before === undefined) {
      const effect = ctx.effects.getEffect(this.effectId);
      const layer = ctx.effects.getLayer(this.effectId, this.layerId);
      if (!effect || !layer || layer.body.type !== 'emitter')
        throw new EffectEditError('notFound', 'Select an emitter layer.');
      if (
        this.trail !== null &&
        (!this.trail.region.trim() ||
          !Number.isInteger(this.trail.maxSegments) ||
          this.trail.maxSegments < 1 ||
          !Number.isFinite(this.trail.segmentSpacing) ||
          this.trail.segmentSpacing <= 0)
      )
        throw new EffectEditError(
          'notFound',
          'Trail needs a region, a positive segment count, and positive spacing.',
        );
      this.before = layer;
      this.index = effect.layerOrder.indexOf(this.layerId);
      const curves = new Map(layer.curves);
      for (const field of ['trailWidthOverLength', 'trailAlphaOverLength'] as const) {
        if (this.trail === null) curves.delete(field);
        else if (!curves.has(field))
          curves.set(field, {
            stops: [
              makeLifeStop(
                ctx.ids.mint('lifeStop'),
                0,
                field === 'trailWidthOverLength' ? 8 : 1,
                'linear',
              ),
              makeLifeStop(ctx.ids.mint('lifeStop'), 1, 0, 'linear'),
            ],
          });
      }
      this.after = { ...layer, body: { ...layer.body, trail: this.trail }, curves };
    }
    this.replace(ctx, this.after!);
  }
  undo(ctx: CommandContext): void {
    if (this.before === undefined) throw new CommandNotAppliedError(this.kind);
    this.replace(ctx, this.before);
  }
  private replace(ctx: CommandContext, layer: EffectLayerEntity): void {
    ctx.effects.removeLayer(this.effectId, this.layerId);
    ctx.effects.insertLayer(this.effectId, layer, this.index);
  }
}

export const setEmitterTrailSpec: EffectCommandSpec = {
  kind: 'effect.layer.trail',
  representativeSeedId: 'library',
  fixture: (effects) => {
    const effect = effects.findEffectByName('coinShower');
    const layer = effect && [...effect.layers.values()].find((l) => l.body.type === 'emitter');
    if (!effect || !layer || layer.body.type !== 'emitter') return null;
    return {
      command: new SetEmitterTrailCommand(
        effect.id,
        layer.id,
        layer.body.trail === null ? { region: 'coin', maxSegments: 16, segmentSpacing: 4 } : null,
      ),
    };
  },
  assertApplied: (before, after) => {
    if (JSON.stringify(before.effects) === JSON.stringify(after.effects))
      throw new Error('Trail edit made no change.');
  },
};
