import { CACHE_GET_USAGE } from '@common';
import { ipcRenderer } from 'electron';

export const cache: CacheContext = {
  getUsage: () => ipcRenderer.invoke(CACHE_GET_USAGE),
};
