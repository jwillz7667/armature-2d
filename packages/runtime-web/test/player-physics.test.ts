import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '@marionette/format';
import { createPlayer, SkeletonView } from '../src';

const document = parseDocument(
  JSON.parse(
    readFileSync(
      new URL('../../conformance/src/rigs/rig-physics-swing.json', import.meta.url),
      'utf8',
    ),
  ),
  { verifyHash: false },
);

describe('packaged player physics clock', () => {
  it('matches a directly advanced SkeletonView instead of freezing the physical pose', async () => {
    const player = await createPlayer({
      document,
      animation: 'sway',
      loop: false,
      atlas: { resolver: null },
    });
    const reference = new SkeletonView();
    reference.syncAnimated(document, 'sway', 0, 0);
    let time = 0;
    for (let i = 0; i < 24; ++i) {
      time += 1 / 60;
      player.update(1 / 60);
      reference.syncAnimated(document, 'sway', time, 1 / 60);
    }
    const actual = player.skeletonView.readBoneWorlds();
    for (const [name, matrix] of reference.readBoneWorlds()) {
      for (let i = 0; i < matrix.length; ++i)
        expect(actual.get(name)?.[i]).toBeCloseTo(matrix[i]!, 10);
    }
    player.destroy();
    reference.destroy();
  });
  it('replays absolute seeks reproducibly and rejects non-finite updates', async () => {
    const player = await createPlayer({
      document,
      animation: 'sway',
      loop: false,
      atlas: { resolver: null },
    });
    player.seek(0.3);
    const first = player.skeletonView.readBoneWorlds();
    for (let i = 0; i < 30; ++i) player.update(1 / 60);
    player.seek(0.3);
    expect(player.skeletonView.readBoneWorlds()).toEqual(first);
    player.update(Number.NaN);
    player.update(Number.POSITIVE_INFINITY);
    expect(player.skeletonView.readBoneWorlds()).toEqual(first);
    expect(() => player.seek(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    player.destroy();
  });
});
