import { Storage } from '@/storage';
import {
  SECURE_STORAGE_READ_CHANNEL,
  SECURE_STORAGE_WRITE_CHANNEL,
  STORAGE_READ_CHANNEL,
  STORAGE_WRITE_CHANNEL,
} from '@common';
import { ipcMain } from 'electron';

type ReadArgs = [string];
type WriteArgs = [string, string];

function validateReadArgs(args: unknown[]): args is ReadArgs {
  return args.length === 1 && typeof args[0] === 'string';
}

function validateWriteArgs(args: unknown[]): args is WriteArgs {
  return args.length === 2 && typeof args[0] === 'string' && typeof args[1] === 'string';
}

export function addStorageEventListeners() {
  ipcMain.handle(SECURE_STORAGE_READ_CHANNEL, async (event, ...args) => {
    if (!validateReadArgs(args)) {
      throw new Error('Invalid arguments');
    }

    Storage.instance.secureRead(args[0]);
  });
  ipcMain.handle(SECURE_STORAGE_WRITE_CHANNEL, async (event, ...args) => {
    if (!validateWriteArgs(args)) {
      throw new Error('Invalid arguments');
    }

    Storage.instance.secureSave(args[0], args[1]);
  });
  ipcMain.handle(STORAGE_READ_CHANNEL, async (event, ...args) => {});
  ipcMain.handle(STORAGE_WRITE_CHANNEL, async (event, ...args) => {});
}
