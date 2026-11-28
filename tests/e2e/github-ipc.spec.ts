import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

test('the PR step goes to the mock GitHub by default and never returns the token', async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nubes-e2e-'));
  const token = `github_pat_${'e2e'.repeat(10)}`;
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
    const result = await page.evaluate(async (pat) => {
      const settings = await window.github.saveSettings({
        token: pat,
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
    }, token);

    expect(result.settings).toEqual({
      hasToken: true,
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
    expect(JSON.stringify(result)).not.toContain(token);

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
