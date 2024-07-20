import { storage } from '#preload';
import { useState, useEffect } from 'react';
import { ACCESS_KEY_ID, SECRET_ACCESS_KEY } from './constants';

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
      const fetchedAccessKeyId = await storage.secureRead(ACCESS_KEY_ID);
      const fetchedSecretAccessKey = await storage.secureRead(SECRET_ACCESS_KEY);
      setAccessKeyId(fetchedAccessKeyId ?? '');
      setSecretAccessKey(fetchedSecretAccessKey ?? '');
    }

    fetchAWSCredentials();

    const unsubscribe = storage.onStorageChange((_event: unknown, args: StorageChangeArgs) => {
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

  return { accessKeyId, secretAccessKey };
};
