import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

test('the PR step goes to the mock GitHub by default, with no token needed', async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nubes-e2e-'));
  const env = { ...process.env, NUBES_BACKGROUND: '1', NUBES_USER_DATA: userDataPath };
  // Whatever the shell running the tests has set, the default must be the mock.
  delete env.NUBES_MOCK_GITHUB;
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: path.resolve(import.meta.dirname, '../..'),
    env,
  });

  try {
    const page = await electronApp.firstWindow();
    // No token: saving one needs the OS keychain, which CI's Linux runner may not have. The
    // token-never-leaves-main checks are unit tests (src/main/listeners/__tests__/github.test.ts).
    const result = await page.evaluate(async () => {
      const settings = await window.github.saveSettings({
        repo: 'salolivares/salolivares.com',
        baseBranch: 'master',
      });
      const photoset = await window.photosets.create({
        name: 'E2E PR',
        bucketName: 'mock-photos-bucket',
        location: 'Big Sur',
        year: 2024,
      });
      await window.photosets.update({ id: photoset.id, description: 'Made by the e2e test.' });
      await window.photosets.markUploaded({ id: photoset.id });
      const first = await window.github.openPullRequest({ photosetId: photoset.id });
      const second = await window.github.openPullRequest({ photosetId: photoset.id });
      const row = await window.photosets.get({ id: photoset.id });
      const test = await window.github.testConnection();
      return { settings, first, second, pullRequestUrl: row?.pullRequestUrl, test };
    });

    expect(result.settings).toEqual({
      hasToken: false,
      repo: 'salolivares/salolivares.com',
      baseBranch: 'master',
      mock: true,
    });
    expect(result.first).toEqual({
      ok: true,
      pullRequest: {
        url: 'https://github.com/salolivares/salolivares.com/pull/mock-1',
        number: 1,
        created: true,
        mock: true,
      },
    });
    expect(result.second).toMatchObject({ ok: true, pullRequest: { number: 1, created: false } });
    expect(result.pullRequestUrl).toBe(
      'https://github.com/salolivares/salolivares.com/pull/mock-1',
    );
    expect(result.test).toMatchObject({ ok: true, message: expect.stringContaining('Mock') });

    const committed = JSON.parse(
      await fs.readFile(
        path.join(
          userDataPath,
          'mock-github/salolivares/salolivares.com/photos/2024-big-sur/src/content/travel/2024-big-sur.json',
        ),
        'utf8',
      ),
    );
    expect(committed).toMatchObject({ title: 'E2E PR', year: 2024, images: [] });
  } finally {
    await electronApp.close();
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
});
