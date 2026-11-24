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
  // Main-process output goes into the test report on failure, so a CI run shows what went wrong.
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

  // A stuck utility process can keep close() from returning (see #129). Kill the app rather than
  // hang the run.
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

test('a dropped file with no path on disk is rejected with a message', async () => {
  await dropInMemoryFile('from-browser.jpg');

  await expect(page.getByText("Couldn't add from-browser.jpg")).toBeVisible();
  await expect(page.getByText('Queued for upload')).not.toBeVisible();
});
