import type { Bucket } from '@aws-sdk/client-s3';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { IS3Provider } from '@/main/drivers/s3/s3-provider';
import { setS3Provider } from '@/main/drivers/s3/s3-provider';

import { appRouter } from '../../root';

const mockBuckets: Bucket[] = [
  { Name: 'photos-bucket', CreationDate: new Date('2024-01-15') },
  { Name: 'travel-bucket', CreationDate: new Date('2024-06-01') },
];

const mockS3: IS3Provider = {
  listBuckets: vi.fn().mockResolvedValue(mockBuckets),
  listImagesInBucket: vi.fn().mockResolvedValue([]),
  createAlbum: vi.fn().mockResolvedValue({ success: true }),
};

beforeAll(() => {
  setS3Provider(mockS3);
});

function createCaller() {
  return appRouter.createCaller({ s3: mockS3 });
}

describe('bucket.list', () => {
  it('returns mocked bucket array', async () => {
    const caller = createCaller();
    const result = await caller.bucket.list();

    expect(result).toEqual(mockBuckets);
    expect(mockS3.listBuckets).toHaveBeenCalled();
  });
});

describe('bucket.createAlbum', () => {
  it('succeeds with valid input', async () => {
    const caller = createCaller();
    const result = await caller.bucket.createAlbum({
      bucketName: 'photos-bucket',
      album: { name: 'Vacation', location: 'Paris', year: 2024, published: false },
      images: [
        {
          id: 'img1',
          name: 'sunset.jpg',
          imagePaths: [
            { imagePath: '/tmp/sunset_640.jpg', type: 'jpg', resolution: 640, byteLength: 5000 },
          ],
        },
      ],
    });

    expect(result).toEqual({ success: true });
    expect(mockS3.createAlbum).toHaveBeenCalledWith(
      'photos-bucket',
      expect.objectContaining({ name: 'Vacation' }),
      expect.arrayContaining([expect.objectContaining({ id: 'img1' })]),
    );
  });

  it('rejects invalid input with Zod error', async () => {
    const caller = createCaller();

    await expect(
      caller.bucket.createAlbum({
        bucketName: 'photos-bucket',
        album: { name: '', location: 'Paris', year: 2024, published: false },
        images: [],
      }),
    ).rejects.toThrow();
  });

  it('rejects missing required fields', async () => {
    const caller = createCaller();

    await expect(
      // @ts-expect-error — intentionally passing invalid input
      caller.bucket.createAlbum({ bucketName: 'bucket' }),
    ).rejects.toThrow();
  });
});
