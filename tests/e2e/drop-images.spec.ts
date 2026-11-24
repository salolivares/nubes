import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from '@playwright/test';
import sharp from 'sharp';

interface TestPhotosetsContext {
  create: (args: {
    name: string;
    bucketName: string;
    location: string;
    year: number;
  }) => Promise<{ id: number }>;
}

let userDataPath: string | undefined;
let electronApp: ElectronApplication | undefined;
let page: Page;
let appOutput: string[] = [];

test.beforeEach(async () => {
  userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nubes-e2e-'));
  appOutput = [];
  electronApp = await electron.launch({
    args: ['.'],
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: {
      ...process.env,
      NUBES_BACKGROUND: '1',
      NUBES_MOCK_S3: '1',
      NUBES_USER_DATA: userDataPath,
    },
  });
  // Main-process and worker output goes into the test report on failure, so a CI run shows why
  // processing stalled.
  electronApp.process().stdout?.on('data', (chunk) => appOutput.push(String(chunk)));
  electronApp.process().stderr?.on('data', (chunk) => appOutput.push(String(chunk)));

  page = await electronApp.firstWindow();
  const photoset = await page.evaluate(() =>
    (window as Window & { photosets?: TestPhotosetsContext }).photosets!.create({
      name: 'Drop test',
      bucketName: 'mock-photos-bucket',
      location: 'Drop test',
      year: 2026,
    }),
  );
  await page.evaluate((id) => (window.location.hash = `#/photoset/${id}/picker`), photoset.id);
  await expect(page.getByText('Drag and drop files here')).toBeVisible();
});

// eslint-disable-next-line no-empty-pattern -- Playwright requires an object pattern for fixtures.
test.afterEach(async ({}, testInfo) => {
  const app = electronApp;
  const dataPath = userDataPath;
  electronApp = undefined;
  userDataPath = undefined;

  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach('app-output.txt', { body: appOutput.join('') });
    const logsDir = dataPath && path.join(dataPath, 'logs');
    for (const name of logsDir ? await fs.readdir(logsDir).catch(() => []) : []) {
      await testInfo.attach(name, { path: path.join(logsDir!, name) });
    }
  }

  // A stuck worker can keep close() from returning. Kill the app rather than hang the run.
  if (app) {
    const closed = app.close().then(() => true);
    const timedOut = new Promise<false>((resolve) => setTimeout(() => resolve(false), 5_000));
    if (!(await Promise.race([closed, timedOut]))) app.process().kill('SIGKILL');
  }
  if (dataPath) await fs.rm(dataPath, { recursive: true, force: true });
});

/** Fires the drag events Chromium sends for a drop, with the files staged in #e2e-drop-source. */
async function dropStagedFiles() {
  await page.evaluate(() => {
    const source = document.getElementById('e2e-drop-source') as HTMLInputElement;
    const dataTransfer = new DataTransfer();
    for (const file of Array.from(source.files ?? [])) dataTransfer.items.add(file);
    source.remove();

    const dropZone = document.querySelector('[data-testid=drop-zone]');
    if (!dropZone) throw new Error('drop zone not found');
    for (const type of ['dragenter', 'dragover', 'drop']) {
      dropZone.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }),
      );
    }
  });
}

function addStagingInput() {
  return page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.id = 'e2e-drop-source';
    input.style.display = 'none';
    document.body.append(input);
  });
}

/**
 * Drops files the way Chromium delivers a drop from Finder: File objects backed by files on disk.
 * Playwright can't start an OS drag, so the files go through a hidden file input first, which
 * gives them their disk backing, and then into the drop event's DataTransfer.
 */
async function dropFilesFromDisk(filePaths: string[]) {
  await addStagingInput();
  await page.setInputFiles('#e2e-drop-source', filePaths);
  await dropStagedFiles();
}

/** Drops a File built in memory, with no file on disk behind it, like an image from a browser. */
async function dropInMemoryFile(name: string) {
  await addStagingInput();
  await page.setInputFiles('#e2e-drop-source', {
    name,
    mimeType: 'image/jpeg',
    buffer: Buffer.from('not really a jpg'),
  });
  await dropStagedFiles();
}

test('a jpg dropped from disk is processed and reaches the review step', async () => {
  const imagePath = path.join(userDataPath, 'dropped.jpg');
  await sharp({ create: { width: 64, height: 48, channels: 3, background: '#3366cc' } })
    .jpeg()
    .toFile(imagePath);

  await dropFilesFromDisk([imagePath]);
  await expect(page.getByText('Queued for upload')).toBeVisible();
  // The thumbnail loads over nubes-media://, which only serves files main put on its allowlist.
  const thumbnail = page.getByRole('img', { name: 'dropped.jpg' });
  await expect(thumbnail).toHaveAttribute('src', /^nubes-media:/);
  await expect
    .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Upload', exact: true }).click();

  await expect(page).toHaveURL(/#\/photoset\/\d+\/s3$/, { timeout: 20_000 });
  // The review step lists the processed image (named without its extension), so the worker read
  // the file from its real path.
  await expect(page.getByRole('heading', { name: 'Review & Upload' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'dropped', exact: true })).toBeVisible();
});

test('a dropped file with no path on disk is rejected with a message', async () => {
  await dropInMemoryFile('from-browser.jpg');

  await expect(page.getByText("Couldn't add from-browser.jpg")).toBeVisible();
  await expect(page.getByText('Queued for upload')).not.toBeVisible();
});
