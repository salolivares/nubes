import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

interface TestS3Context {
  isMock: () => Promise<boolean>;
  listBuckets: () => Promise<Array<{ Name?: string; CreationDate?: Date }>>;
  createAlbum: (args: {
    bucketName: string;
    album: {
      name: string;
      location: string;
      description: string;
      year: number;
      month?: number;
      published: boolean;
    };
    images: [];
  }) => Promise<{ success: boolean; error?: string }>;
}

test('renderer can list buckets through Electron IPC', async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nubes-e2e-'));
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: {
      ...process.env,
      NUBES_MOCK_S3: '1',
      // Don't take focus from whatever the person running the tests is doing.
      NUBES_BACKGROUND: '1',
      NUBES_USER_DATA: userDataPath,
    },
  });

  try {
    const page = await electronApp.firstWindow();

    const buckets = await page.evaluate(async () => {
      const s3 = (window as Window & { s3?: TestS3Context }).s3;
      if (!s3) throw new Error('window.s3 was not exposed by the preload');

      return (await s3.listBuckets()).map((bucket) => ({
        name: bucket.Name,
        creationDateIsDate: bucket.CreationDate instanceof Date,
      }));
    });

    expect(
      await page.evaluate(() => (window as Window & { s3?: TestS3Context }).s3?.isMock()),
    ).toBe(true);

    expect(buckets).toContainEqual({
      name: 'mock-photos-bucket',
      creationDateIsDate: true,
    });
  } finally {
    await electronApp.close();
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
});

test('renderer can create an album through Electron IPC', async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nubes-e2e-'));
  const runId = Date.now();
  const location = `E2E ${runId}`;
  const albumPath = path.join(userDataPath, 'mock-s3', 'mock-photos-bucket', `2026-e2e-${runId}`);
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: {
      ...process.env,
      NUBES_MOCK_S3: '1',
      // Don't take focus from whatever the person running the tests is doing.
      NUBES_BACKGROUND: '1',
      NUBES_USER_DATA: userDataPath,
    },
  });

  try {
    const page = await electronApp.firstWindow();
    const result = await page.evaluate(
      async ({ albumLocation, albumName }) => {
        const s3 = (window as Window & { s3?: TestS3Context }).s3;
        if (!s3) throw new Error('window.s3 was not exposed by the preload');

        return s3.createAlbum({
          bucketName: 'mock-photos-bucket',
          album: {
            name: albumName,
            location: albumLocation,
            description: 'Made by the e2e test.',
            year: 2026,
            month: 3,
            published: false,
          },
          images: [],
        });
      },
      { albumLocation: location, albumName: `IPC E2E ${runId}` },
    );

    expect(result).toEqual({ success: true });
    // Named after the prefix, because the site turns the filename into the album id.
    const metadata = JSON.parse(
      await fs.readFile(path.join(albumPath, `2026-e2e-${runId}.json`), 'utf-8'),
    );
    expect(metadata).toEqual({
      title: `IPC E2E ${runId}`,
      description: 'Made by the e2e test.',
      location,
      year: 2026,
      month: 3,
      published: false,
      images: [],
    });
  } finally {
    await electronApp.close();
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
});

test('album creation rejects invalid input at the IPC boundary', async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nubes-e2e-'));
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: {
      ...process.env,
      NUBES_MOCK_S3: '1',
      // Don't take focus from whatever the person running the tests is doing.
      NUBES_BACKGROUND: '1',
      NUBES_USER_DATA: userDataPath,
    },
  });

  try {
    const page = await electronApp.firstWindow();

    await expect(
      page.evaluate(async () => {
        const s3 = (window as Window & { s3?: TestS3Context }).s3;
        if (!s3) throw new Error('window.s3 was not exposed by the preload');

        return s3.createAlbum({
          bucketName: 'mock-photos-bucket',
          album: {
            name: '',
            location: 'Test Place',
            description: 'D',
            year: 2026,
            published: false,
          },
          images: [],
        });
      }),
    ).rejects.toThrow(/Album name is required/);
  } finally {
    await electronApp.close();
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
});
