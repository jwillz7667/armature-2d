import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../src/concurrency';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('mapWithConcurrency', () => {
  it('never exceeds the limit and preserves input order', async () => {
    const limit = 8;
    const total = 40;
    let inFlight = 0;
    let maxInFlight = 0;

    const results = await mapWithConcurrency(
      Array.from({ length: total }, (_unused, i) => i),
      limit,
      async (item) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await delay(3);
        inFlight -= 1;
        return item * 2;
      },
    );

    expect(maxInFlight).toBeLessThanOrEqual(limit);
    // The pool saturates: with more items than the limit, exactly `limit` run concurrently.
    expect(maxInFlight).toBe(limit);
    expect(results).toEqual(Array.from({ length: total }, (_unused, i) => i * 2));
  });

  it('processes fewer items than the limit without spinning up extra workers', async () => {
    let maxInFlight = 0;
    let inFlight = 0;

    await mapWithConcurrency([1, 2, 3], 8, async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(1);
      inFlight -= 1;
      return item;
    });

    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it('returns an empty array for empty input', async () => {
    expect(await mapWithConcurrency([], 8, async () => 1)).toEqual([]);
  });

  it('rejects a non-positive limit', async () => {
    await expect(mapWithConcurrency([1], 0, async (n) => n)).rejects.toMatchObject({
      code: 'ATLAS_INVALID_CONFIG',
    });
  });
});

it('stops scheduling on failure and drains in-flight reads before rejecting', async () => {
  let release: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started: number[] = [];
  let drained = false;
  const failure = new Error('read failed');
  const result = mapWithConcurrency([0, 1, 2, 3], 2, async (value) => {
    started.push(value);
    if (value === 0) throw failure;
    await pending;
    drained = true;
    return value;
  });
  let settled = false;
  const observed = result.catch((error: unknown) => {
    settled = true;
    expect(error).toBe(failure);
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).toBe(false);
  release();
  await observed;
  expect(drained).toBe(true);
  expect(started).toEqual([0, 1]);
});
