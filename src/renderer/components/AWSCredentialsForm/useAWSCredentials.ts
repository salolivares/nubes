import { AWS_REGION, DEFAULT_AWS_REGION } from '@common';
import { useEffect, useState } from 'react';

import type { CredentialsStatus } from '@/common/types';
import { credentialsStatusSchema, storageChangeSchema } from '@/common/types';

const EMPTY_STATUS: CredentialsStatus = { accessKeyId: null, hasSecret: false };

/**
 * Saved AWS credentials as the renderer sees them: the access key ID and whether a secret is
 * saved. Main never sends the secret itself.
 */
export const useAWSCredentials = () => {
  const [status, setStatus] = useState<CredentialsStatus>(EMPTY_STATUS);
  const [awsRegion, setAwsRegion] = useState<string>(DEFAULT_AWS_REGION);

  useEffect(() => {
    async function fetchAWSCredentials() {
      const [fetchedStatus, fetchedRegion] = await Promise.all([
        window.storage.credentialsStatus(),
        window.storage.read(AWS_REGION),
      ]);
      setStatus(fetchedStatus ?? EMPTY_STATUS);
      setAwsRegion(fetchedRegion || DEFAULT_AWS_REGION);
    }

    fetchAWSCredentials();

    const unsubscribeCredentials = window.storage.onCredentialsChange((next) => {
      setStatus(credentialsStatusSchema.parse(next));
    });
    const unsubscribeStorage = window.storage.onStorageChange((change) => {
      const { key, newValue } = storageChangeSchema.parse(change);
      if (key === AWS_REGION) {
        setAwsRegion(newValue || DEFAULT_AWS_REGION);
      }
    });

    return () => {
      unsubscribeCredentials();
      unsubscribeStorage();
    };
  }, []);

  const accessKeyId = status.accessKeyId ?? '';
  const { hasSecret } = status;
  const isSet = !!accessKeyId && hasSecret;

  return { accessKeyId, hasSecret, awsRegion, isSet };
};
