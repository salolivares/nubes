import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { PutObjectCommand } from '@aws-sdk/client-s3';
import { S3Client } from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { travelAlbumSchema } from '@/common/album-metadata';
import type { Album, ProcessedImage } from '@/common/types';
import { S3 } from '@/main/drivers/s3/s3';

vi.mock('@/main/drivers/storage', () => ({
  Storage: {
    instance: {
      secureRead: () => 'test-value',
      read: () => undefined,
      store: { onDidChange: () => () => {} },
    },
  },
}));

const album: Album = {
  name: 'Trip',
  description: 'A drive up the coast.',
  location: 'Big Sur',
  year: 2024,
  month: 6,
  published: false,
};

describe('S3.createAlbum', () => {
  let dir: string;
  let images: ProcessedImage[];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nubes-s3-test-'));
    const imagePaths = (['jpg', 'webp'] as const).flatMap((type) =>
      [128, 640].map((resolution) => {
        const imagePath = path.join(dir, `sunset_${resolution}.${type}`);
        fs.writeFileSync(imagePath, `${resolution}.${type}`);
        return { imagePath, type, resolution, byteLength: 0 };
      }),
    );
    images = [{ id: 'a', name: 'Sunset', camera: 'X100', imagePaths }];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('logs a failed upload with its key, keeps going, and skips the metadata', async () => {
    const failure = new Error('AccessDenied');
    const sent: string[] = [];
    vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
      const key = (command as PutObjectCommand).input.Key!;
      sent.push(key);
      if (key.endsWith('_640.webp')) throw failure;
      return {};
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await S3.instance.createAlbum('bucket', album, images);

    expect(result).toEqual({ success: false });
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to upload image 2024-big-sur/sunset_640.webp:',
      failure,
    );
    expect(sent).toHaveLength(4);
    expect(sent.some((key) => key.endsWith('.json'))).toBe(false);
  });

  it('logs a failed metadata upload with its key', async () => {
    const failure = new Error('SlowDown');
    vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
      if ((command as PutObjectCommand).input.Key!.endsWith('.json')) throw failure;
      return {};
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await S3.instance.createAlbum('bucket', album, images);

    expect(result).toEqual({ success: false });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(/^Failed to upload metadata 2024-big-sur\/.+\.json:$/),
      failure,
    );
  });

  it('reads each file in its own batch instead of all up front', async () => {
    // Two photos make 8 files, so the uploads run as a batch of 5, then a batch of 3.
    images.push({ ...images[0], id: 'b', name: 'Dawn' });
    const events: string[] = [];
    vi.spyOn(fs.promises, 'readFile').mockImplementation(async (file) => {
      events.push('read');
      return Buffer.from(String(file));
    });
    vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
      const key = (command as PutObjectCommand).input.Key!;
      events.push(key.endsWith('.json') ? 'metadata' : 'send');
      return {};
    });

    const result = await S3.instance.createAlbum('bucket', album, images);

    expect(result).toEqual({ success: true });
    expect(events).toEqual([
      ...Array(5).fill('read'),
      ...Array(5).fill('send'),
      ...Array(3).fill('read'),
      ...Array(3).fill('send'),
      'metadata',
    ]);
  });

  it('uploads metadata the site accepts, named after the image prefix', async () => {
    const sent: PutObjectCommand['input'][] = [];
    vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
      sent.push((command as PutObjectCommand).input);
      return {};
    });

    const result = await S3.instance.createAlbum('bucket', album, images);

    expect(result).toEqual({ success: true });
    const metadata = sent.find((input) => input.Key!.endsWith('.json'))!;
    // The site reads the album id from the filename and loads `{id}/{image id}_{size}.{ext}`.
    expect(metadata.Key).toBe('2024-big-sur/2024-big-sur.json');
    expect(sent.map((input) => input.Key)).toContain('2024-big-sur/sunset_640.webp');
    expect(travelAlbumSchema.parse(JSON.parse(metadata.Body as string))).toEqual({
      title: 'Trip',
      description: 'A drive up the coast.',
      location: 'Big Sur',
      year: 2024,
      month: 6,
      published: false,
      images: [{ id: 'sunset', name: 'Sunset', camera: 'X100' }],
    });
  });

  it('rejects an album the site would reject before uploading anything', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);

    const result = await S3.instance.createAlbum('bucket', { ...album, month: 13 }, images);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/site's schema[\s\S]*month/);
    expect(send).not.toHaveBeenCalled();
  });
});
