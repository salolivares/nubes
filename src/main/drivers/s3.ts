import fsp from 'node:fs/promises';

import type { Bucket, PutObjectCommandOutput } from '@aws-sdk/client-s3';
import {
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

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
        region: 'us-west-1',
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

  private async getImageData(imagePath: string): Promise<Buffer> {
    return fsp.readFile(imagePath);
  }

  private async batchPromises<T, R>(
    items: T[],
    operation: (item: T) => Promise<R>,
    batchSize = 5
  ): Promise<{ results: R[]; errors: Error[] }> {
    const results: R[] = [];
    const errors: Error[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((item) =>
          operation(item).then(
            (result) => ({ result }),
            (error) => ({ error })
          )
        )
      );

      for (const batchResult of batchResults) {
        if (batchResult.error) {
          errors.push(batchResult.error);
        } else {
          results.push(batchResult.result);
        }
      }
    }

    return { results, errors };
  }

  public async createAlbum(bucketName: string, albumName: string, images: ProcessedImage[]) {
    const operations: Array<() => Promise<PutObjectCommandOutput>> = [];

    for (const image of images) {
      for (const outputImage of image.imagePaths) {
        const { imagePath, type, resolution } = outputImage;

        const key = `${albumName}/${image.name}_${resolution}.${type}`;
        const imageData = await this.getImageData(imagePath);

        const uploadCommand = new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: imageData,
          ContentType: `image/${type}`,
        });

        operations.push(async () => {
          if (!this.client) {
            throw new Error('S3 client not configured');
          }

          try {
            return this.client.send(uploadCommand);
          } catch (error) {
            console.error(`Failed to upload image ${key}:`, error);
            throw error;
          }
        });
      }
    }

    return this.batchPromises(operations, (operation) => operation());
  }
}
