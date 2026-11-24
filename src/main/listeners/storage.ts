import type { CredentialsStatus, StorageChange } from '@/common/types';
import { storageArgsSchema } from '@/common/types';
import { broadcast, handle } from '@/main/ipc';

import {
  ACCESS_KEY_ID,
  AWS_REGION,
  CREDENTIALS_CHANGE,
  CREDENTIALS_STATUS_CHANNEL,
  SECRET_ACCESS_KEY,
  SECURE_STORAGE_WRITE,
  STORAGE_CHANGE,
  STORAGE_CHANNEL,
  STORAGE_READ,
  STORAGE_WRITE,
} from '../../common/constants';
import { Storage } from '../drivers/storage';

/**
 * The renderer's view of the saved credentials. The decrypted secret never leaves main: only
 * whether one is saved.
 */
export function getCredentialsStatus(): CredentialsStatus {
  return {
    accessKeyId: Storage.instance.secureRead(ACCESS_KEY_ID),
    hasSecret: Storage.instance.secureRead(SECRET_ACCESS_KEY) !== null,
  };
}

export function addStorageEventListeners() {
  handle(STORAGE_CHANNEL, storageArgsSchema, async (_, args) => {
    switch (args.action) {
      case STORAGE_READ:
        return Storage.instance.read(args.key);
      case STORAGE_WRITE:
        return Storage.instance.write(args.key, args.value);
      case SECURE_STORAGE_WRITE:
        return Storage.instance.secureWrite(args.key, args.value);
    }
  });

  handle(CREDENTIALS_STATUS_CHANNEL, () => getCredentialsStatus());

  const pushCredentialsStatus = () => broadcast(CREDENTIALS_CHANGE, getCredentialsStatus());
  Storage.instance.store.onDidChange(ACCESS_KEY_ID, () => pushCredentialsStatus());
  Storage.instance.store.onDidChange(SECRET_ACCESS_KEY, () => pushCredentialsStatus());

  Storage.instance.store.onDidChange(AWS_REGION, (newValue, oldValue) => {
    const change: StorageChange = {
      key: AWS_REGION,
      newValue: newValue ?? '',
      oldValue: oldValue ?? '',
    };
    broadcast(STORAGE_CHANGE, change);
  });
}
