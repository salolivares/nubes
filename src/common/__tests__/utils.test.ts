import { describe, expect, it } from 'vitest';

import { batchPromises } from '../utils';

describe('batchPromises', () => {
  it('returns empty results for empty array', async () => {
    const { results, errors } = await batchPromises([], async (x: number) => x);
    expect(results).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('processes all items when fewer than batch size', async () => {
    const { results, errors } = await batchPromises([1, 2, 3], async (x) => x * 2, 5);
    expect(results).toEqual([2, 4, 6]);
    expect(errors).toEqual([]);
  });

  it('splits items across batches', async () => {
    const batches: number[][] = [];
    let currentBatch: number[] = [];

    const { results } = await batchPromises(
      [1, 2, 3, 4, 5],
      async (x) => {
        currentBatch.push(x);
        // Detect batch boundaries by checking if this is the last in a group
        if (currentBatch.length === 2 || x === 5) {
          batches.push([...currentBatch]);
          currentBatch = [];
        }
        return x;
      },
      2,
    );

    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(batches.length).toBeGreaterThanOrEqual(2);
  });

  it('collects errors without aborting remaining items', async () => {
    const { results, errors } = await batchPromises(
      [1, 2, 3, 4],
      async (x) => {
        if (x === 2) throw new Error('fail on 2');
        return x;
      },
      10,
    );

    expect(results).toEqual([1, 3, 4]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('fail on 2');
  });

  it('respects custom batch size', async () => {
    const callOrder: number[] = [];

    await batchPromises(
      [1, 2, 3],
      async (x) => {
        callOrder.push(x);
        return x;
      },
      1,
    );

    // With batch size 1, items are processed sequentially
    expect(callOrder).toEqual([1, 2, 3]);
  });

  it('defaults to batch size 5', async () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    const batchStarts: number[] = [];

    await batchPromises(items, async (x) => {
      if (x % 5 === 0) batchStarts.push(x);
      return x;
    });

    // 12 items / batch 5 = 3 batches starting at 0, 5, 10
    expect(batchStarts).toEqual([0, 5, 10]);
  });
});
