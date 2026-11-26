import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';
import { _electron as electron, expect, test } from '@playwright/test';

// A database left at migration 0000, with two photosets. See scripts/create-e2e-fixture-db.ts.
const FIXTURE_DB = path.resolve(import.meta.dirname, 'fixtures/nubes-0000.db');

interface TestPhotoset {
  id: number;
  name: string;
  location: string;
  description: string;
  month: number | null;
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
      // Don't take focus from whatever the person running the tests is doing.
      NUBES_BACKGROUND: '1',
      NUBES_USER_DATA: userDataPath,
    },
  });

  // Main-process output (migration errors, crashes) goes to the test log, so a CI failure
  // shows why the app didn't come up.
  const appOutput: string[] = [];
  electronApp.process().stdout?.on('data', (chunk) => appOutput.push(String(chunk)));
  electronApp.process().stderr?.on('data', (chunk) => appOutput.push(String(chunk)));

  // The CSP (src/common/csp.ts) must not block anything the app itself loads. Listen from the
  // first window event so boot-time violations count too.
  const cspViolations: string[] = [];
  const watchConsole = (window: Page) =>
    window.on('console', (message) => {
      if (message.text().includes('Content Security Policy')) cspViolations.push(message.text());
    });
  electronApp.on('window', watchConsole);
  electronApp.windows().forEach(watchConsole);

  try {
    const page = await electronApp.firstWindow();
    // Built runs load the bundle from the nubes://app scheme, never file://.
    expect(page.url()).toMatch(/^nubes:\/\/app\/index\.html/);

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
        description: photoset.description,
        month: photoset.month,
        yearIsNumber: Number.isInteger(photoset.year),
        images: photoset.images.length,
        outputs: photoset.images.flatMap((image) => image.outputs).length,
      })),
    ).toEqual([
      {
        name: 'Fixture Joshua Tree',
        location: 'Joshua Tree, CA',
        description: '',
        month: null,
        yearIsNumber: true,
        images: 2,
        outputs: 16,
      },
      {
        name: 'Fixture Untitled Roll',
        location: '',
        description: '',
        month: null,
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

    // Open a photoset so thumbnails render (nubes-media:// or the base64 fallback).
    await rows.filter({ hasText: 'Fixture Joshua Tree' }).click();
    await expect(page.getByRole('img').first()).toBeVisible();
    expect(cspViolations).toEqual([]);

    // The CSP is a response header from the nubes://app handler, and the handler serves only the
    // renderer bundle.
    const responses = await page.evaluate(async () => {
      const get = async (url: string) => {
        try {
          const res = await fetch(url);
          return { status: res.status, csp: res.headers.get('content-security-policy') };
        } catch {
          return { status: -1, csp: null };
        }
      };
      return {
        index: await get('nubes://app/index.html'),
        traversal: await get('nubes://app/..%2f..%2f..%2fpackage.json'),
        missing: await get('nubes://app/missing.js'),
      };
    });
    expect(responses.index.status).toBe(200);
    expect(responses.index.csp).toContain("frame-ancestors 'none'");
    expect(responses.index.csp).toContain("script-src 'self';");
    expect(responses.traversal.status).toBe(404);
    expect(responses.missing.status).toBe(404);
    expect(responses.missing.csp).toContain("frame-ancestors 'none'");

    // The header is enforced on the page itself: an inline script must not run.
    const inlineRan = await page.evaluate(() => {
      const w = window as Window & { inlineRan?: boolean };
      const script = document.createElement('script');
      script.textContent = 'window.inlineRan = true;';
      document.head.append(script);
      return w.inlineRan === true;
    });
    expect(inlineRan).toBe(false);
    cspViolations.length = 0;

    // 'self' is nubes://app, not every file: URL, so a valid image elsewhere on disk must not
    // load.
    const outsideImage = path.join(userDataPath, 'outside.png');
    await fs.writeFile(
      outsideImage,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64',
      ),
    );
    const loaded = await page.evaluate(
      (src) =>
        new Promise<boolean>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = src;
        }),
      pathToFileURL(outsideImage).toString(),
    );
    expect(loaded).toBe(false);
  } catch (error) {
    console.error(`Electron output:\n${appOutput.join('')}`);
    throw error;
  } finally {
    await electronApp.close();
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
});
