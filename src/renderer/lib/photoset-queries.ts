import { queryOptions } from '@tanstack/react-query';

/** Query keys for photosets. Invalidate `photosetKeys.all` after any photoset write. */
export const photosetKeys = {
  all: ['photosets'] as const,
  detail: (id: number) => ['photosets', 'detail', id] as const,
};

/**
 * One photoset with its images and outputs. Resolves to `null` when the id is unknown, because
 * React Query treats `undefined` data as an error.
 */
export const photosetQuery = (id: number) =>
  queryOptions({
    queryKey: photosetKeys.detail(id),
    queryFn: async () => (await window.photosets.get({ id })) ?? null,
    // Local SQLite over IPC. The default 'online' mode pauses the query while the OS is offline.
    networkMode: 'always',
  });
