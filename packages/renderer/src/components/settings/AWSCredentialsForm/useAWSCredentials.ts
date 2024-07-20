import { storage } from '#preload';
import { useState, useEffect } from 'react';
import { ACCESS_KEY_ID, SECRET_ACCESS_KEY } from './constants';

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
  }, []);

  return { accessKeyId, secretAccessKey };
};
