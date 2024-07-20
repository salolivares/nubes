import { Storage } from '@/storage';
import {
  SECURE_STORAGE_READ,
  SECURE_STORAGE_WRITE,
  STORAGE_CHANNEL,
  STORAGE_READ,
  STORAGE_WRITE,
} from '@common';
import { ipcMain } from 'electron';

type ReadAction = typeof STORAGE_READ | typeof SECURE_STORAGE_READ;
type WriteAction = typeof STORAGE_WRITE | typeof SECURE_STORAGE_WRITE;

type ReadArgs = {
  action: ReadAction;
  key: string;
};

type WriteArgs = {
  action: WriteAction;
  key: string;
  value: string;
};

type Args = ReadArgs | WriteArgs;

function validateArgs(args: unknown): asserts args is Args {
  if (!args || typeof args !== 'object') {
    throw new Error('Invalid arguments');
  }

  const { action, key, value } = args as Record<string, unknown>;

  if (typeof action !== 'string' || typeof key !== 'string') {
    throw new Error('Invalid arguments');
  }

  if ((action === SECURE_STORAGE_WRITE || action === STORAGE_WRITE) && typeof value !== 'string') {
    throw new Error('Invalid arguments');
  }

  if ((action === SECURE_STORAGE_READ || action === STORAGE_READ) && value !== undefined) {
    throw new Error('Invalid arguments');
  }
}

export function addStorageEventListeners() {
  ipcMain.handle(STORAGE_CHANNEL, async (_event, args) => {
    validateArgs(args);

    if (args.action === SECURE_STORAGE_READ || args.action === STORAGE_READ) {
      const { action, key } = args;
      switch (action) {
        case SECURE_STORAGE_READ:
          return Storage.instance.secureRead(key);
        case STORAGE_READ:
          return Storage.instance.read(key);
      }
    } else if (args.action === SECURE_STORAGE_WRITE || args.action === STORAGE_WRITE) {
      const { action, key, value } = args;
      switch (action) {
        case SECURE_STORAGE_WRITE:
          return Storage.instance.secureWrite(key, value);
        case STORAGE_WRITE:
          return Storage.instance.write(key, value);
      }
    }

    throw new Error('Invalid action');
  });
}
