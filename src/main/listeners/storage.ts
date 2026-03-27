import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import { z } from 'zod';

import {
  ACCESS_KEY_ID,
  AWS_REGION,
  SECRET_ACCESS_KEY,
  SECURE_STORAGE_READ,
  SECURE_STORAGE_WRITE,
  STORAGE_CHANGE,
  STORAGE_CHANNEL,
  STORAGE_READ,
  STORAGE_WRITE,
} from '../../common/constants';
import { Storage } from '../drivers/storage';

const readArgsSchema = z.object({
  action: z.union([z.literal(STORAGE_READ), z.literal(SECURE_STORAGE_READ)]),
  key: z.string(),
});

const writeArgsSchema = z.object({
  action: z.union([z.literal(STORAGE_WRITE), z.literal(SECURE_STORAGE_WRITE)]),
  key: z.string(),
  value: z.string(),
});

const argsSchema = z.union([readArgsSchema, writeArgsSchema]);

export function addStorageEventListeners(mainWindow: BrowserWindow) {
  ipcMain.handle(STORAGE_CHANNEL, async (_, rawArgs) => {
    const args = argsSchema.parse(rawArgs);

    const { action, key } = args;

    if (action === SECURE_STORAGE_READ || action === STORAGE_READ) {
      switch (action) {
        case SECURE_STORAGE_READ:
          return Storage.instance.secureRead(key);
        case STORAGE_READ:
          return Storage.instance.read(key);
      }
    } else if (action === SECURE_STORAGE_WRITE || action === STORAGE_WRITE) {
      const { value } = args;
      switch (action) {
        case SECURE_STORAGE_WRITE:
          return Storage.instance.secureWrite(key, value);
        case STORAGE_WRITE:
          return Storage.instance.write(key, value);
      }
    }

    throw new Error('Invalid action');
  });

  Storage.instance.store.onDidChange(ACCESS_KEY_ID, (newValue: string, oldValue?: string) => {
    try {
      mainWindow.webContents.send(STORAGE_CHANGE, {
        key: ACCESS_KEY_ID,
        newValue: Storage.instance.decrypt(newValue),
        oldValue: Storage.instance.decrypt(oldValue ?? ''),
      });
    } catch {
      // Stale ciphertext from a previous app identity — ignore
    }
  });

  Storage.instance.store.onDidChange(SECRET_ACCESS_KEY, (newValue: string, oldValue?: string) => {
    try {
      mainWindow.webContents.send(STORAGE_CHANGE, {
        key: SECRET_ACCESS_KEY,
        newValue: Storage.instance.decrypt(newValue),
        oldValue: Storage.instance.decrypt(oldValue ?? ''),
      });
    } catch {
      // Stale ciphertext from a previous app identity — ignore
    }
  });

  Storage.instance.store.onDidChange(AWS_REGION, (newValue: string, oldValue?: string) => {
    mainWindow.webContents.send(STORAGE_CHANGE, {
      key: AWS_REGION,
      newValue: newValue ?? '',
      oldValue: oldValue ?? '',
    });
  });
}
