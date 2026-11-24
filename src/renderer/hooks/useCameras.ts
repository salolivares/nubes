import { CAMERA_SORT_MODE_KEY, CAMERAS_STORAGE_KEY } from '@common';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { cameraKeys, localNetworkMode, localQuery } from '../lib/photoset-queries';

export type CameraSortMode = 'lastUsed' | 'custom';

export interface CameraEntry {
  name: string;
  lastUsed: string; // ISO date
}

export function sortCameras(cameras: CameraEntry[], mode: CameraSortMode): CameraEntry[] {
  if (mode === 'lastUsed') {
    return [...cameras].sort((a, b) => b.lastUsed.localeCompare(a.lastUsed));
  }
  return cameras; // custom order = stored order
}

const EMPTY: CameraEntry[] = [];

async function loadCameras(): Promise<CameraEntry[]> {
  const raw = await window.storage.read(CAMERAS_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as CameraEntry[];
  } catch {
    return [];
  }
}

async function saveCameras(cameras: CameraEntry[]): Promise<void> {
  await window.storage.write(CAMERAS_STORAGE_KEY, JSON.stringify(cameras));
}

async function loadSortMode(): Promise<CameraSortMode> {
  const raw = await window.storage.read(CAMERA_SORT_MODE_KEY);
  return raw === 'custom' ? 'custom' : 'lastUsed';
}

async function saveSortMode(mode: CameraSortMode): Promise<void> {
  await window.storage.write(CAMERA_SORT_MODE_KEY, mode);
}

const camerasQuery = queryOptions({
  queryKey: cameraKeys.list(),
  queryFn: loadCameras,
  ...localQuery,
  // useCameras is the only writer and updates this cache itself, so a refetch can't learn more.
  staleTime: Infinity,
});

const sortModeQuery = queryOptions({
  queryKey: cameraKeys.sortMode(),
  queryFn: loadSortMode,
  ...localQuery,
  staleTime: Infinity,
});

/**
 * Saved cameras, shared by every component that calls this hook. Writes update the cache first,
 * then electron-store. A failed write reloads from disk.
 */
export function useCameras() {
  const queryClient = useQueryClient();
  const { data: cameras = EMPTY, isPending: camerasPending } = useQuery(camerasQuery);
  const { data: sortMode = 'lastUsed', isPending: sortModePending } = useQuery(sortModeQuery);

  // Wait out a read that's in flight (first load, or the reload after a failed write). Otherwise
  // its older result lands after the write and, with staleTime Infinity, sticks.
  const settled = useCallback(
    async (queryKey: readonly unknown[]) => {
      const query = queryClient.getQueryCache().find({ queryKey });
      if (query?.state.fetchStatus === 'fetching') await query.promise?.catch(() => undefined);
    },
    [queryClient],
  );

  const { mutateAsync: saveList } = useMutation({
    mutationFn: saveCameras,
    networkMode: localNetworkMode,
    onError: () => queryClient.invalidateQueries({ queryKey: camerasQuery.queryKey }),
  });

  /**
   * Apply `change` to the latest cached list and save it. The cache is read and set in one step,
   * so calls made in the same tick (the combobox adds, then selects) build on each other. They also
   * wait in call order, so that holds when a read is in flight too.
   */
  const update = useCallback(
    async (change: (list: CameraEntry[]) => CameraEntry[] | null) => {
      await settled(camerasQuery.queryKey);
      const next = change(queryClient.getQueryData(camerasQuery.queryKey) ?? EMPTY);
      if (!next) return;
      queryClient.setQueryData(camerasQuery.queryKey, next);
      await saveList(next);
    },
    [queryClient, saveList, settled],
  );

  const { mutateAsync: saveMode } = useMutation({
    mutationFn: saveSortMode,
    networkMode: localNetworkMode,
    onError: () => queryClient.invalidateQueries({ queryKey: sortModeQuery.queryKey }),
  });

  const addCamera = useCallback(
    (name: string) =>
      update((list) => {
        const trimmed = name.trim();
        if (!trimmed || list.some((c) => c.name === trimmed)) return null;
        return [...list, { name: trimmed, lastUsed: new Date().toISOString() }];
      }),
    [update],
  );

  const removeCamera = useCallback(
    (name: string) => update((list) => list.filter((c) => c.name !== name)),
    [update],
  );

  const touchCamera = useCallback(
    (name: string) =>
      update((list) => {
        const now = new Date().toISOString();
        return list.some((c) => c.name === name)
          ? list.map((c) => (c.name === name ? { ...c, lastUsed: now } : c))
          : [...list, { name, lastUsed: now }];
      }),
    [update],
  );

  const renameCamera = useCallback(
    (oldName: string, newName: string) =>
      update((list) => {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldName || list.some((c) => c.name === trimmed)) return null;
        return list.map((c) => (c.name === oldName ? { ...c, name: trimmed } : c));
      }),
    [update],
  );

  const reorderCameras = useCallback(
    (reordered: CameraEntry[]) => update(() => reordered),
    [update],
  );

  const setSortMode = useCallback(
    async (mode: CameraSortMode) => {
      await settled(sortModeQuery.queryKey);
      queryClient.setQueryData(sortModeQuery.queryKey, mode);
      await saveMode(mode);
    },
    [queryClient, saveMode, settled],
  );

  return {
    cameras: sortCameras(cameras, sortMode),
    rawCameras: cameras,
    sortMode,
    setSortMode,
    addCamera,
    removeCamera,
    renameCamera,
    touchCamera,
    reorderCameras,
    loaded: !camerasPending && !sortModePending,
  };
}
