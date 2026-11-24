import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

// A database left at migration 0000, with two photosets. See scripts/create-e2e-fixture-db.ts.
const FIXTURE_DB = path.resolve(import.meta.dirname, 'fixtures/nubes-0000.db');

interface TestPhotoset {
  id: number;
  name: string;
  location: string;
  year: number;
  images: Array<{ outputs: unknown[] }>;
}

interface TestPhotosetsContext {
  list: (args: { sortBy: 'name'; sortOrder: 'asc' }) => Promise<Array<{ id: number }>>;
  get: (args: { id: number }) => Promise<TestPhotoset>;
}

test('app boots on a database from migration 0000 and lists its photosets', async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nubes-e2e-'));
  await fs.copyFile(FIXTURE_DB, path.join(userDataPath, 'nubes.db'));

  const electronApp = await electron.launch({
    args: ['.'],
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: {
      ...process.env,
      NUBES_MOCK_S3: '1',
      NUBES_USER_DATA: userDataPath,
    },
  });

  // Main-process output (migration errors, crashes) goes to the test log, so a CI failure
  // shows why the app didn't come up.
  const appOutput: string[] = [];
  electronApp.process().stdout?.on('data', (chunk) => appOutput.push(String(chunk)));
  electronApp.process().stderr?.on('data', (chunk) => appOutput.push(String(chunk)));

  try {
    const page = await electronApp.firstWindow();

    await expect(page.getByRole('heading', { name: 'Photosets' })).toBeVisible();

    const rows = page.locator('a[href^="#/photoset/"]');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'Fixture Joshua Tree' })).toContainText('2 images');
    await expect(rows.filter({ hasText: 'Fixture Untitled Roll' })).toContainText('1 image');

    // 0002 and 0003 fill in the NULL year and location, and their table rebuilds keep the
    // images and outputs that hang off each photoset.
    const photosets = await page.evaluate(async () => {
      const api = (window as Window & { photosets?: TestPhotosetsContext }).photosets;
      if (!api) throw new Error('window.photosets was not exposed by the preload');
      const list = await api.list({ sortBy: 'name', sortOrder: 'asc' });
      return Promise.all(list.map(({ id }) => api.get({ id })));
    });
    expect(
      photosets.map((photoset) => ({
        name: photoset.name,
        location: photoset.location,
        yearIsNumber: Number.isInteger(photoset.year),
        images: photoset.images.length,
        outputs: photoset.images.flatMap((image) => image.outputs).length,
      })),
    ).toEqual([
      {
        name: 'Fixture Joshua Tree',
        location: 'Joshua Tree, CA',
        yearIsNumber: true,
        images: 2,
        outputs: 16,
      },
      {
        name: 'Fixture Untitled Roll',
        location: '',
        yearIsNumber: true,
        images: 1,
        outputs: 8,
      },
    ]);

    // Migrations were pending, so startup snapshotted the 0000 database first.
    const backups = (await fs.readdir(userDataPath)).filter((name) =>
      name.startsWith('nubes.db.bak-'),
    );
    expect(backups).toHaveLength(1);
  } catch (error) {
    console.error(`Electron output:\n${appOutput.join('')}`);
    throw error;
  } finally {
    await electronApp.close();
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
});
