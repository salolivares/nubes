import type { Bucket } from '@aws-sdk/client-s3';

import type { Album, ProcessedImage, S3CreateAlbumResult } from '@/common/types';

import { S3 } from './s3';

/** Uploads images only. The album JSON goes to the site repo through the GitHub provider. */
export interface IS3Provider {
  listBuckets(): Promise<Bucket[]>;
  listImagesInBucket(bucketName: string): Promise<string[]>;
  createAlbum(
    bucketName: string,
    album: Album,
    images: ProcessedImage[],
  ): Promise<S3CreateAlbumResult>;
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
