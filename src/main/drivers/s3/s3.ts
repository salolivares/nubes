import fsp from 'node:fs/promises';

import type { Bucket } from '@aws-sdk/client-s3';
import {
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import type { Album, ProcessedImage } from '@/common/types';
import { batchPromises, metadataFilename, slugify } from '@/common/utils';

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
    const prefix = `${album.year}-${slugify(album.location)}`;
    const uploads = images.flatMap((image) =>
      image.imagePaths.map(({ imagePath, type, resolution }) => ({
        imagePath,
        type,
        key: `${prefix}/${slugify(image.name)}_${resolution}.${type}`,
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
   * Creates a json file in the bucket with metadata about the album.
   */
  private async createAlbumMetadata(bucketName: string, album: Album, images: ProcessedImage[]) {
    const client = this.requireClient();

    const prefix = `${album.year}-${slugify(album.location)}`;
    const key = `${prefix}/${metadataFilename(album.year, album.name)}`;
    // Create the metadata object that matches the JSON structure
    const metadata = {
      title: album.name,
      location: album.location,
      year: album.year,
      published: album.published,
      images: images.map((image) => ({
        id: slugify(image.name),
        name: image.name,
        camera: image.camera,
      })),
    };

    // Convert the metadata object to JSON
    const metadataJson = JSON.stringify(metadata);

    const uploadCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: metadataJson,
      ContentType: 'application/json',
    });

    try {
      return await client.send(uploadCommand);
    } catch (err) {
      console.error(`Failed to upload metadata ${key}:`, err);
      throw err;
    }
  }

  public async createAlbum(bucketName: string, album: Album, images: ProcessedImage[]) {
    const imageUploadResults = await this.createAlbumImages(bucketName, album, images);

    // Don't publish metadata that points at images missing from the bucket.
    if (imageUploadResults.errors.length > 0) {
      return { success: false };
    }

    try {
      await this.createAlbumMetadata(bucketName, album, images);
    } catch {
      // Already logged with its key in createAlbumMetadata.
      return { success: false };
    }

    return { success: true };
  }
}
