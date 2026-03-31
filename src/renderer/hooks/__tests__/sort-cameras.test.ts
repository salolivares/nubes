import { describe, expect, it } from 'vitest';

import type { CameraEntry } from '../useCameras';
import { sortCameras } from '../useCameras';

const cameras: CameraEntry[] = [
  { name: 'Canon R5', lastUsed: '2024-06-01T00:00:00Z' },
  { name: 'Sony A7IV', lastUsed: '2024-09-15T00:00:00Z' },
  { name: 'Fuji X-T5', lastUsed: '2024-03-10T00:00:00Z' },
];

describe('sortCameras', () => {
  it('sorts by lastUsed descending in lastUsed mode', () => {
    const sorted = sortCameras(cameras, 'lastUsed');
    expect(sorted.map((c) => c.name)).toEqual(['Sony A7IV', 'Canon R5', 'Fuji X-T5']);
  });

  it('preserves original order in custom mode', () => {
    const sorted = sortCameras(cameras, 'custom');
    expect(sorted.map((c) => c.name)).toEqual(['Canon R5', 'Sony A7IV', 'Fuji X-T5']);
  });

  it('does not mutate the original array', () => {
    const original = [...cameras];
    sortCameras(cameras, 'lastUsed');
    expect(cameras).toEqual(original);
  });

  it('handles empty array', () => {
    expect(sortCameras([], 'lastUsed')).toEqual([]);
    expect(sortCameras([], 'custom')).toEqual([]);
  });

  it('handles single item', () => {
    const single = [{ name: 'Leica Q3', lastUsed: '2024-01-01T00:00:00Z' }];
    expect(sortCameras(single, 'lastUsed')).toEqual(single);
  });
});
