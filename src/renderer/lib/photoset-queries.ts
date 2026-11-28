import type { QueryClient } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';

import type { PhotosetListArgs } from '@/common/types';

type ListArgs = NonNullable<PhotosetListArgs>;

// Local SQLite and electron-store over IPC. The default 'online' mode pauses queries and mutations
// while the OS reports offline, which would leave local pages spinning forever.
export const localNetworkMode = 'always' as const;

/**
 * Options for queries that read local data over IPC. A failed local read won't pass on a retry, and
 * the default three retries hold back the error for about 7 seconds.
 */
export const localQuery = { networkMode: localNetworkMode, retry: false } as const;

/** Query keys for photosets. Invalidate `photosetKeys.all` after any photoset write. */
export const photosetKeys = {
  all: ['photosets'] as const,
  lists: () => ['photosets', 'list'] as const,
  list: (args: ListArgs) => ['photosets', 'list', args] as const,
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
    ...localQuery,
  });

/** Photosets with their image ids, in the given order. */
export const photosetListQuery = (args: ListArgs) =>
  queryOptions({
    queryKey: photosetKeys.list(args),
    queryFn: () => window.photosets.list(args),
    ...localQuery,
  });

type PhotosetListRow = Awaited<ReturnType<Window['photosets']['list']>>[number];

/**
 * After deleting photosets: drop them from every cached list now, so a page that mounts next (Home
 * after a draft delete) never shows them while it refetches. Then refetch the lists and cache
 * usage that are on screen. A detail query on screen is left alone; the page showing it is on its
 * way out, and refetching it there would flash "not found".
 */
export async function forgetPhotosets(queryClient: QueryClient, ids: number[]) {
  queryClient.setQueriesData<PhotosetListRow[]>({ queryKey: photosetKeys.lists() }, (rows) =>
    rows?.filter((row) => !ids.includes(row.id)),
  );
  for (const id of ids) {
    queryClient.removeQueries({ queryKey: photosetKeys.detail(id), type: 'inactive' });
  }
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: photosetKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: cacheKeys.all }),
  ]);
}

/** Disk used by processed images. Invalidate after anything that writes or deletes them. */
export const cacheKeys = {
  all: ['cache'] as const,
  usage: () => ['cache', 'usage'] as const,
};

export const cacheUsageQuery = () =>
  queryOptions({
    queryKey: cacheKeys.usage(),
    queryFn: () => window.cache.getUsage(),
    ...localQuery,
    // Image processing and draft edits write files without touching this key. Drop the value when
    // Storage closes, so it never opens on an old number.
    gcTime: 0,
  });

/** Saved cameras and their sort mode, both in electron-store. Only `useCameras` writes them. */
export const cameraKeys = {
  all: ['cameras'] as const,
  list: () => ['cameras', 'list'] as const,
  sortMode: () => ['cameras', 'sortMode'] as const,
};

/** S3 state. */
export const s3Keys = {
  all: ['s3'] as const,
  isMock: () => ['s3', 'isMock'] as const,
  buckets: () => ['s3', 'buckets'] as const,
};

/** GitHub settings for the site repo. Invalidate after saving or clearing them. */
export const githubKeys = {
  all: ['github'] as const,
  settings: () => ['github', 'settings'] as const,
};

export const githubSettingsQuery = () =>
  queryOptions({
    queryKey: githubKeys.settings(),
    queryFn: () => window.github.settings(),
    ...localQuery,
  });
