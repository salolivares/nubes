import { CAMERA_SORT_MODE_KEY,CAMERAS_STORAGE_KEY } from '@common';
import { useCallback, useEffect, useState } from 'react';

export type CameraSortMode = 'lastUsed' | 'custom';

export interface CameraEntry {
  name: string;
  lastUsed: string; // ISO date
}

function sortCameras(cameras: CameraEntry[], mode: CameraSortMode): CameraEntry[] {
  if (mode === 'lastUsed') {
    return [...cameras].sort((a, b) => b.lastUsed.localeCompare(a.lastUsed));
  }
  return cameras; // custom order = stored order
}

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

export function useCameras() {
  const [cameras, setCameras] = useState<CameraEntry[]>([]);
  const [sortMode, setSortModeState] = useState<CameraSortMode>('lastUsed');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([loadCameras(), loadSortMode()]).then(([c, m]) => {
      setCameras(c);
      setSortModeState(m);
      setLoaded(true);
    });
  }, []);

  const sorted = sortCameras(cameras, sortMode);

  const persist = useCallback(async (next: CameraEntry[]) => {
    setCameras(next);
    await saveCameras(next);
  }, []);

  const addCamera = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || cameras.some((c) => c.name === trimmed)) return;
      const next = [...cameras, { name: trimmed, lastUsed: new Date().toISOString() }];
      await persist(next);
    },
    [cameras, persist]
  );

  const removeCamera = useCallback(
    async (name: string) => {
      await persist(cameras.filter((c) => c.name !== name));
    },
    [cameras, persist]
  );

  const touchCamera = useCallback(
    async (name: string) => {
      const next = cameras.map((c) =>
        c.name === name ? { ...c, lastUsed: new Date().toISOString() } : c
      );
      await persist(next);
    },
    [cameras, persist]
  );

  const reorderCameras = useCallback(
    async (reordered: CameraEntry[]) => {
      await persist(reordered);
    },
    [persist]
  );

  const setSortMode = useCallback(async (mode: CameraSortMode) => {
    setSortModeState(mode);
    await saveSortMode(mode);
  }, []);

  return {
    cameras: sorted,
    rawCameras: cameras,
    sortMode,
    setSortMode,
    addCamera,
    removeCamera,
    touchCamera,
    reorderCameras,
    loaded,
  };
}
