import { ACCESS_KEY_ID, AWS_REGION, DEFAULT_AWS_REGION, SECRET_ACCESS_KEY } from '@common';
import { useEffect, useState } from 'react';
import { z } from 'zod';

const storageChangeArgsSchema = z.object({
  key: z.string(),
  newValue: z.string(),
  oldValue: z.string(),
});

export const useAWSCredentials = () => {
  const [accessKeyId, setAccessKeyId] = useState<string>('');
  const [secretAccessKey, setSecretAccessKey] = useState<string>('');
  const [awsRegion, setAwsRegion] = useState<string>(DEFAULT_AWS_REGION);

  useEffect(() => {
    async function fetchAWSCredentials() {
      const fetchedAccessKeyId = await window.storage.secureRead(ACCESS_KEY_ID);
      const fetchedSecretAccessKey = await window.storage.secureRead(SECRET_ACCESS_KEY);
      const fetchedRegion = await window.storage.read(AWS_REGION);
      setAccessKeyId(fetchedAccessKeyId ?? '');
      setSecretAccessKey(fetchedSecretAccessKey ?? '');
      setAwsRegion(fetchedRegion ?? DEFAULT_AWS_REGION);
    }

    fetchAWSCredentials();

    const unsubscribe = window.storage.onStorageChange((_, args) => {
      const { key, newValue } = storageChangeArgsSchema.parse(args);
      if (key === ACCESS_KEY_ID) {
        setAccessKeyId(newValue);
      }
      if (key === SECRET_ACCESS_KEY) {
        setSecretAccessKey(newValue);
      }
      if (key === AWS_REGION) {
        setAwsRegion(newValue || DEFAULT_AWS_REGION);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const isSet = accessKeyId && secretAccessKey;

  return { accessKeyId, secretAccessKey, awsRegion, isSet };
};
