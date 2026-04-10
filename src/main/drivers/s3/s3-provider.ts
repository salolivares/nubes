import type { Bucket } from '@aws-sdk/client-s3';

import type { Album, ProcessedImage } from '@/common/types';

import { S3 } from './s3';

export interface IS3Provider {
  listBuckets(): Promise<Bucket[]>;
  listImagesInBucket(bucketName: string): Promise<string[]>;
  createAlbum(
    bucketName: string,
    album: Album,
    images: ProcessedImage[],
  ): Promise<{ success: boolean }>;
}

let currentProvider: IS3Provider | null = null;

export function getS3Provider(): IS3Provider {
  if (!currentProvider) {
    currentProvider = S3.instance;
  }
  return currentProvider;
}

export function setS3Provider(provider: IS3Provider): void {
  currentProvider = provider;
}
