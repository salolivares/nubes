import fsp from 'node:fs/promises';

import type { Bucket } from '@aws-sdk/client-s3';
import {
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import type { TravelAlbum } from '@/common/album-metadata';
import {
  albumId,
  albumImageId,
  AlbumMetadataError,
  albumMetadataFilename,
  assertPhotosNamed,
  buildAlbumMetadata,
  serializeAlbumMetadata,
} from '@/common/album-metadata';
import type { Album, ProcessedImage, S3CreateAlbumResult } from '@/common/types';
import { batchPromises } from '@/common/utils';

import {
  ACCESS_KEY_ID,
  AWS_REGION,
  DEFAULT_AWS_REGION,
  SECRET_ACCESS_KEY,
} from '../../../common/constants';
import { Storage } from '../storage';
import type { IS3Provider } from './s3-provider';

export class S3 implements IS3Provider {
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
    this.storage.store.onDidChange(AWS_REGION, () => {
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
    const region = this.storage.read(AWS_REGION) ?? DEFAULT_AWS_REGION;

    if (accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        region,
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
          (item) => item.Key ?? '',
        )
      : [];

    return imageFiles;
  }

  /**
   * Uploads every output file, five at a time. Each file is read just before its own upload, so at
   * most one batch of images is in memory. A failed upload is logged with its key and lands in
   * `errors`.
   */
  private async createAlbumImages(bucketName: string, album: Album, images: ProcessedImage[]) {
    const prefix = albumId(album);
    const uploads = images.flatMap((image) =>
      image.imagePaths.map(({ imagePath, type, resolution }) => ({
        imagePath,
        type,
        key: `${prefix}/${albumImageId(image.name)}_${resolution}.${type}`,
      })),
    );

    return batchPromises(uploads, async ({ imagePath, type, key }) => {
      try {
        const client = this.requireClient();
        const body = await fsp.readFile(imagePath);
        return await client.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: body,
            ContentType: `image/${type}`,
          }),
        );
      } catch (error) {
        console.error(`Failed to upload image ${key}:`, error);
        throw error;
      }
    });
  }

  private requireClient(): S3Client {
    if (!this.client) {
      throw new Error('S3 client not configured');
    }
    return this.client;
  }

  /**
   * Uploads the album JSON, already built and checked by `buildAlbumMetadata()`, next to its
   * images.
   */
  private async createAlbumMetadata(bucketName: string, album: Album, metadata: TravelAlbum) {
    const key = `${albumId(album)}/${albumMetadataFilename(album)}`;
    const uploadCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: serializeAlbumMetadata(metadata),
      ContentType: 'application/json',
    });

    try {
      return await this.requireClient().send(uploadCommand);
    } catch (err) {
      console.error(`Failed to upload metadata ${key}:`, err);
      throw err;
    }
  }

  public async createAlbum(
    bucketName: string,
    album: Album,
    images: ProcessedImage[],
  ): Promise<S3CreateAlbumResult> {
    // Check the metadata first, so an album the site can't build never reaches the bucket.
    let metadata: TravelAlbum;
    try {
      assertPhotosNamed(images);
      metadata = buildAlbumMetadata(album, images);
    } catch (err) {
      if (err instanceof AlbumMetadataError) return { success: false, error: err.message };
      throw err;
    }

    const imageUploadResults = await this.createAlbumImages(bucketName, album, images);

    // Don't publish metadata that points at images missing from the bucket.
    if (imageUploadResults.errors.length > 0) {
      return { success: false };
    }

    try {
      await this.createAlbumMetadata(bucketName, album, metadata);
    } catch {
      // Already logged with its key in createAlbumMetadata.
      return { success: false };
    }

    return { success: true };
  }
}
