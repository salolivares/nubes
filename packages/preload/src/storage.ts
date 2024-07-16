import {
  SECURE_STORAGE_READ_CHANNEL,
  SECURE_STORAGE_WRITE_CHANNEL,
  STORAGE_READ_CHANNEL,
  STORAGE_WRITE_CHANNEL,
} from '@common';
import { ipcRenderer } from 'electron';

export const secureRead = (key: string) => ipcRenderer.invoke(SECURE_STORAGE_READ_CHANNEL, key);
export const secureWrite = (key: string, value: string) =>
  ipcRenderer.invoke(SECURE_STORAGE_WRITE_CHANNEL, key, value);

export const read = (key: string) => ipcRenderer.invoke(STORAGE_READ_CHANNEL, key);
export const write = (key: string, value: string) =>
  ipcRenderer.invoke(STORAGE_WRITE_CHANNEL, key, value);
