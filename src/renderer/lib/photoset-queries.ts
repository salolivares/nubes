import type { QueryClient } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';

import type { PhotosetListArgs } from '@/common/types';

type ListArgs = NonNullable<PhotosetListArgs>;

// Local SQLite and electron-store over IPC. The default 'online' mode pauses queries and mutations
// while the OS reports offline, which would leave local pages spinning forever.
export const localNetworkMode = 'always' as const;

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
    networkMode: localNetworkMode,
  });

/** Photosets with their image ids, in the given order. */
export const photosetListQuery = (args: ListArgs) =>
  queryOptions({
    queryKey: photosetKeys.list(args),
    queryFn: () => window.photosets.list(args),
    networkMode: localNetworkMode,
  });

type PhotosetListRow = Awaited<ReturnType<Window['photosets']['list']>>[number];

/**
 * After deleting photosets: drop them from every cached list now, so a page that mounts next (Home
 * after a draft delete) never shows them while it refetches. Then refetch the lists and cache
 * usage that are on screen. The detail query is left alone; the page showing it is on its way out,
 * and refetching it there would flash "not found".
 */
export async function forgetPhotosets(queryClient: QueryClient, ids: number[]) {
  queryClient.setQueriesData<PhotosetListRow[]>({ queryKey: photosetKeys.lists() }, (rows) =>
    rows?.filter((row) => !ids.includes(row.id)),
  );
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
    networkMode: localNetworkMode,
  });

/** Saved cameras and their sort mode, both in electron-store. Only `useCameras` writes them. */
export const cameraKeys = {
  all: ['cameras'] as const,
  list: () => ['cameras', 'list'] as const,
  sortMode: () => ['cameras', 'sortMode'] as const,
};

/**
 * S3 state. Buckets are keyed on the credentials and region, so saving new credentials never shows
 * the buckets of the old ones.
 */
export const s3Keys = {
  all: ['s3'] as const,
  isMock: () => ['s3', 'isMock'] as const,
  buckets: (accessKeyId: string, region: string) => ['s3', 'buckets', accessKeyId, region] as const,
};
