import {
  CREDENTIALS_CHANGE,
  CREDENTIALS_STATUS_CHANNEL,
  SECURE_STORAGE_WRITE,
  STORAGE_CHANGE,
  STORAGE_CHANNEL,
  STORAGE_READ,
  STORAGE_WRITE,
} from '@common';
import type { IpcRendererEvent } from 'electron';
import { ipcRenderer } from 'electron';

import type { CredentialsStatus, SecureStorageKey, StorageChange } from '@/common/types';

const storageSend = (action: string, key: string, value?: string) =>
  ipcRenderer.invoke(STORAGE_CHANNEL, { action, key, value });

const secureWrite = (key: SecureStorageKey, value: string) =>
  storageSend(SECURE_STORAGE_WRITE, key, value);

const read = (key: string) => storageSend(STORAGE_READ, key);
const write = (key: string, value: string) => storageSend(STORAGE_WRITE, key, value);

const credentialsStatus = (): Promise<CredentialsStatus> =>
  ipcRenderer.invoke(CREDENTIALS_STATUS_CHANNEL);

// The listeners get the payload only. The IpcRendererEvent holds `sender` (ipcRenderer itself),
// which would let the page send on any channel.
const onStorageChange = (listener: (change: StorageChange) => void) => {
  const handler = (_: IpcRendererEvent, change: StorageChange) => listener(change);
  ipcRenderer.on(STORAGE_CHANGE, handler);
  return () => ipcRenderer.off(STORAGE_CHANGE, handler);
};

const onCredentialsChange = (listener: (status: CredentialsStatus) => void) => {
  const handler = (_: IpcRendererEvent, status: CredentialsStatus) => listener(status);
  ipcRenderer.on(CREDENTIALS_CHANGE, handler);
  return () => ipcRenderer.off(CREDENTIALS_CHANGE, handler);
};

export const storage: StorageContext = {
  credentialsStatus,
  secureWrite,
  read,
  write,
  onStorageChange,
  onCredentialsChange,
};
