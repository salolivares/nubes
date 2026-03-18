import fsp from 'node:fs/promises';
import path from 'node:path';

import type { Bucket } from '@aws-sdk/client-s3';
import { app } from 'electron';

import type { Album, ProcessedImage } from '@/common/types';

import type { IS3Provider } from './s3-provider';

const MOCK_BUCKETS: Bucket[] = [
  { Name: 'mock-photos-bucket', CreationDate: new Date('2024-01-15') },
  { Name: 'mock-travel-bucket', CreationDate: new Date('2024-06-01') },
  { Name: 'mock-portfolio-bucket', CreationDate: new Date('2025-03-10') },
];

const MOCK_IMAGES: Record<string, string[]> = {
  'mock-photos-bucket': [
    '2024-yosemite/sunset_1920.jpg',
    '2024-yosemite/half-dome_1920.jpg',
    '2024-yosemite/el-capitan_1920.webp',
    '2024-yosemite/metadata.json',
  ],
  'mock-travel-bucket': [
    '2025-tokyo/shibuya_1920.jpg',
    '2025-tokyo/temple_1920.jpg',
    '2025-tokyo/metadata.json',
  ],
  'mock-portfolio-bucket': [],
};

function getMockBasePath(): string {
  return path.join(app.getPath('temp'), 'nubes-mock');
}

function albumDirName(album: Album): string {
  return `${album.year}-${album.location.replace(/\s+/g, '-').toLowerCase()}`;
}

export class MockS3 implements IS3Provider {
  async listBuckets(): Promise<Bucket[]> {
    return MOCK_BUCKETS;
  }

  async listImagesInBucket(bucketName: string): Promise<string[]> {
    const images = MOCK_IMAGES[bucketName] ?? [];
    return images.filter((key) => key.match(/\.(jpg|jpeg|png|gif|webp)$/i));
  }

  async createAlbum(
    bucketName: string,
    album: Album,
    images: ProcessedImage[],
  ): Promise<{ success: boolean }> {
    const basePath = getMockBasePath();
    const albumDir = path.join(basePath, bucketName, albumDirName(album));
    await fsp.mkdir(albumDir, { recursive: true });

    for (const image of images) {
      for (const outputImage of image.imagePaths) {
        const { imagePath, type, resolution } = outputImage;
        const destName = `${image.name.replace(/\s+/g, '-').toLowerCase()}_${resolution}.${type}`;
        const destPath = path.join(albumDir, destName);
        await fsp.copyFile(imagePath, destPath);
      }
    }

    const metadata = {
      title: album.name,
      location: album.location,
      year: album.year,
      published: album.published,
      images: images.map((image) => ({
        id: image.name.replace(/\s+/g, '-').toLowerCase(),
        name: image.name,
        camera: image.camera,
      })),
    };

    await fsp.writeFile(path.join(albumDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    console.log(`[MockS3] Album written to: ${albumDir}`);
    return { success: true };
  }
}

export function getMockS3Path(): string {
  return getMockBasePath();
}
