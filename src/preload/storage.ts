import {
  SECURE_STORAGE_READ,
  SECURE_STORAGE_WRITE,
  STORAGE_CHANGE,
  STORAGE_CHANNEL,
  STORAGE_READ,
  STORAGE_WRITE,
} from '@common';
import type { IpcRendererEvent } from 'electron';
import { ipcRenderer } from 'electron';

const storageSend = (action: string, key: string, value?: string) =>
  ipcRenderer.invoke(STORAGE_CHANNEL, { action, key, value });

const secureRead = (key: string) => storageSend(SECURE_STORAGE_READ, key);
const secureWrite = (key: string, value: string) => storageSend(SECURE_STORAGE_WRITE, key, value);

const read = (key: string) => storageSend(STORAGE_READ, key);
const write = (key: string, value: string) => storageSend(STORAGE_WRITE, key, value);

const onStorageChange = (listener: (event: IpcRendererEvent, ...args: any[]) => void) => {
  const handler = (event: IpcRendererEvent, ...args: any[]) => listener(event, ...args);
  ipcRenderer.on(STORAGE_CHANGE, handler);
  return () => ipcRenderer.off(STORAGE_CHANGE, handler);
};

export const storage: StorageContext = {
  secureRead,
  secureWrite,
  read,
  write,
  onStorageChange,
};
