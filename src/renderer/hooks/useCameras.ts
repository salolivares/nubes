import { CAMERA_SORT_MODE_KEY, CAMERAS_STORAGE_KEY } from '@common';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { cameraKeys, localNetworkMode } from '../lib/photoset-queries';

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
  networkMode: localNetworkMode,
  // useCameras is the only writer and updates this cache itself, so a refetch can't learn more.
  staleTime: Infinity,
});

const sortModeQuery = queryOptions({
  queryKey: cameraKeys.sortMode(),
  queryFn: loadSortMode,
  networkMode: localNetworkMode,
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

  // The cache is set before the write starts, not in onMutate (which runs async), so a second call
  // in the same tick (the combobox adds, then selects) already sees the first one's list.
  const { mutateAsync: saveList } = useMutation({
    mutationFn: saveCameras,
    networkMode: localNetworkMode,
    onError: () => queryClient.invalidateQueries({ queryKey: camerasQuery.queryKey }),
  });
  const persist = useCallback(
    (next: CameraEntry[]) => {
      queryClient.setQueryData(camerasQuery.queryKey, next);
      return saveList(next);
    },
    [queryClient, saveList],
  );

  const { mutateAsync: saveMode } = useMutation({
    mutationFn: saveSortMode,
    networkMode: localNetworkMode,
    onError: () => queryClient.invalidateQueries({ queryKey: sortModeQuery.queryKey }),
  });

  const current = useCallback(
    () => queryClient.getQueryData(camerasQuery.queryKey) ?? EMPTY,
    [queryClient],
  );

  const addCamera = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      const list = current();
      if (!trimmed || list.some((c) => c.name === trimmed)) return;
      await persist([...list, { name: trimmed, lastUsed: new Date().toISOString() }]);
    },
    [current, persist],
  );

  const removeCamera = useCallback(
    async (name: string) => {
      await persist(current().filter((c) => c.name !== name));
    },
    [current, persist],
  );

  const touchCamera = useCallback(
    async (name: string) => {
      const now = new Date().toISOString();
      const list = current();
      const exists = list.some((c) => c.name === name);
      const next = exists
        ? list.map((c) => (c.name === name ? { ...c, lastUsed: now } : c))
        : [...list, { name, lastUsed: now }];
      await persist(next);
    },
    [current, persist],
  );

  const renameCamera = useCallback(
    async (oldName: string, newName: string) => {
      const trimmed = newName.trim();
      const list = current();
      if (!trimmed || trimmed === oldName) return;
      if (list.some((c) => c.name === trimmed)) return;
      await persist(list.map((c) => (c.name === oldName ? { ...c, name: trimmed } : c)));
    },
    [current, persist],
  );

  const reorderCameras = useCallback(
    async (reordered: CameraEntry[]) => {
      await persist(reordered);
    },
    [persist],
  );

  const setSortMode = useCallback(
    async (mode: CameraSortMode) => {
      queryClient.setQueryData(sortModeQuery.queryKey, mode);
      await saveMode(mode);
    },
    [queryClient, saveMode],
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
