import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

import { _electron as electron, expect, test } from '@playwright/test';

const projectDir = path.resolve(import.meta.dirname, '../..');

test('the preload bundle is one CommonJS file that only requires electron', async () => {
  const buildDir = path.join(projectDir, '.vite/build');
  const preloads = (await fs.readdir(buildDir)).filter((name) => name.startsWith('preload'));
  expect(preloads).toEqual(['preload.cjs']);

  const code = await fs.readFile(path.join(buildDir, 'preload.cjs'), 'utf8');
  const requires = Array.from(code.matchAll(/\brequire\(\s*([^)]*?)\s*\)/g), (m) =>
    m[1].replace(/^(["'`])(.*)\1$/, '$2'),
  );
  expect(requires.length).toBeGreaterThan(0);
  expect(new Set(requires)).toEqual(new Set(['electron']));
  // Compiling as a classic script throws on any import or export statement.
  expect(() => new vm.Script(code)).not.toThrow();
  expect(code).not.toMatch(/\bimport\s*\(/);
});

test('the main window runs sandboxed and the preload still exposes its APIs', async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nubes-e2e-'));
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: projectDir,
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

    const prefs = await electronApp.evaluate(({ BrowserWindow }) => {
      const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return {
        sandbox: prefs?.sandbox,
        contextIsolation: prefs?.contextIsolation,
        nodeIntegration: prefs?.nodeIntegration,
      };
    });
    expect(prefs).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false });

    // getLastWebPreferences() leaves out the preload path, so check that the preload ran instead.
    const exposed = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return ['cache', 'storage', 'themeMode', 'imagePicker', 'imageProcessor', 'photosets', 's3']
        .filter((name) => typeof w[name] === 'object' && w[name] !== null)
        .sort();
    });
    expect(exposed).toEqual(
      ['cache', 'imagePicker', 'imageProcessor', 'photosets', 's3', 'storage', 'themeMode'].sort(),
    );

    // The production build never exposes the debug API.
    expect(await page.evaluate(() => 'debug' in window)).toBe(false);
  } finally {
    await electronApp.close();
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
});
