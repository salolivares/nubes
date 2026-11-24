import { describe, expect, it, vi } from 'vitest';

import { makeListRow, newQueryClient } from '../../test-utils';
import { cacheKeys, forgetPhotosets, photosetKeys } from '../photoset-queries';

describe('forgetPhotosets', () => {
  it('drops the ids from every cached list and invalidates lists and cache usage', async () => {
    const queryClient = newQueryClient();
    const byDate = photosetKeys.list({ sortBy: 'createdAt', sortOrder: 'desc' });
    const byName = photosetKeys.list({ sortBy: 'name', sortOrder: 'asc' });
    queryClient.setQueryData(byDate, [makeListRow({ id: 1 }), makeListRow({ id: 2 })]);
    queryClient.setQueryData(byName, [makeListRow({ id: 2 }), makeListRow({ id: 1 })]);
    queryClient.setQueryData(cacheKeys.usage(), { totalBytes: 1, fileCount: 1 });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await forgetPhotosets(queryClient, [1]);

    const ids = (key: readonly unknown[]) =>
      queryClient.getQueryData<{ id: number }[]>(key)?.map((p) => p.id);
    expect(ids(byDate)).toEqual([2]);
    expect(ids(byName)).toEqual([2]);
    expect(queryClient.getQueryState(byDate)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(cacheKeys.usage())?.isInvalidated).toBe(true);
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: photosetKeys.all });
  });
});
