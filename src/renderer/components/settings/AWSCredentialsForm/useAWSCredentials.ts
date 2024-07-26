import { ACCESS_KEY_ID, SECRET_ACCESS_KEY } from '@common';
import { useState, useEffect } from 'react';

type StorageChangeArgs = {
  key: typeof ACCESS_KEY_ID | typeof SECRET_ACCESS_KEY;
  newValue: string;
  oldValue: string;
};

function validateArgs(args: unknown): asserts args is StorageChangeArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Invalid arguments');
  }

  const { key, newValue, oldValue } = args as Record<string, unknown>;

  if (typeof key !== 'string' || typeof newValue !== 'string' || typeof oldValue !== 'string') {
    throw new Error('Invalid arguments');
  }
}

export const useAWSCredentials = () => {
  const [accessKeyId, setAccessKeyId] = useState<string>('');
  const [secretAccessKey, setSecretAccessKey] = useState<string>('');

  useEffect(() => {
    async function fetchAWSCredentials() {
      const fetchedAccessKeyId = await window.storage.secureRead(ACCESS_KEY_ID);
      const fetchedSecretAccessKey = await window.storage.secureRead(SECRET_ACCESS_KEY);
      setAccessKeyId(fetchedAccessKeyId ?? '');
      setSecretAccessKey(fetchedSecretAccessKey ?? '');
    }

    fetchAWSCredentials();

    const unsubscribe = window.storage.onStorageChange((_, args: StorageChangeArgs) => {
      validateArgs(args);
      if (args.key === ACCESS_KEY_ID) {
        setAccessKeyId(args.newValue);
      }
      if (args.key === SECRET_ACCESS_KEY) {
        setSecretAccessKey(args.newValue);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const isSet = accessKeyId && secretAccessKey;

  return { accessKeyId, secretAccessKey, isSet };
};
