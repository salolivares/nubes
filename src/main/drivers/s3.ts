import type { Bucket } from '@aws-sdk/client-s3';
import { ListBucketsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

import type { ProcessedImage } from '@/common/types';

import { ACCESS_KEY_ID, SECRET_ACCESS_KEY } from '../../common/constants';
import { Storage } from './storage';

export class S3 {
  static #instance: S3;
  private client: S3Client | null = null;
  private storage: Storage;

  private constructor() {
    this.storage = Storage.instance;
    this.configureS3Client();

    this.storage.store.onDidChange(ACCESS_KEY_ID, () => {
      this.configureS3Client();
    });
    this.storage.store.onDidChange(SECRET_ACCESS_KEY, () => {
      this.configureS3Client();
    });
  }

  public static get instance(): S3 {
    if (!S3.#instance) {
      S3.#instance = new S3();
    }

    return S3.#instance;
  }

  private configureS3Client(): void {
    const accessKeyId = this.storage.secureRead(ACCESS_KEY_ID);
    const secretAccessKey = this.storage.secureRead(SECRET_ACCESS_KEY);

    if (accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        // TODO(sal): this should be configurable
        region: 'us-west-2',
      });
    } else {
      this.client = null;
    }
  }

  public async listBuckets(): Promise<Bucket[]> {
    if (!this.client) {
      throw new Error('S3 client not configured');
    }

    const command = new ListBucketsCommand();
    const { Buckets } = await this.client.send(command);

    return Buckets ?? [];
  }

  public async listImagesInBucket(bucketName: string): Promise<string[]> {
    if (!this.client) {
      throw new Error('S3 client not configured');
    }

    const command = new ListObjectsV2Command({ Bucket: bucketName });
    const response = await this.client.send(command);

    const imageFiles = response.Contents
      ? response.Contents.filter((item) => item.Key?.match(/\.(jpg|jpeg|png|gif)$/i)).map(
          (item) => item.Key ?? ''
        )
      : [];

    return imageFiles;
  }

  public async createAlbum(
    bucketName: string,
    albumName: string,
    images: ProcessedImage[]
  ): Promise<void> {
    if (!this.client) {
      throw new Error('S3 client not configured');
    }

    console.log('Creating album', bucketName, albumName, images);
  }
}
