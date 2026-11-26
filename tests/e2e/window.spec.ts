import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';
import { _electron as electron, expect, test } from '@playwright/test';

const projectDir = path.resolve(import.meta.dirname, '../..');

function launch(userDataPath: string) {
  return electron.launch({
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
}

/** electron-store's file in userData. */
async function readConfig(userDataPath: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(path.join(userDataPath, 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

function windowInfo(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return {
      bounds: window.getNormalBounds(),
      isMaximized: window.isMaximized(),
      backgroundColor: window.getBackgroundColor(),
    };
  });
}

test('the window reopens where it was left', async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nubes-e2e-'));
  const bounds = { x: 120, y: 200, width: 1000, height: 700 };

  const first = await launch(userDataPath);
  try {
    await first.firstWindow();
    await first.evaluate(({ BrowserWindow }, b) => {
      BrowserWindow.getAllWindows()[0].setBounds(b);
    }, bounds);
    // Saved once the window has sat still for a moment, without waiting for it to close.
    await expect
      .poll(async () => JSON.parse(String((await readConfig(userDataPath)).windowState ?? 'null')))
      .toMatchObject({
        ...(process.platform === 'linux' ? {} : { x: bounds.x, y: bounds.y }),
        width: bounds.width,
        height: bounds.height,
        isMaximized: false,
      });
  } finally {
    await first.close();
  }

  const second = await launch(userDataPath);
  try {
    await second.firstWindow();
    const { bounds: restored } = await windowInfo(second);
    expect(restored.width).toBe(bounds.width);
    expect(restored.height).toBe(bounds.height);
    // Without a window manager, xvfb doesn't place windows where they ask to go.
    if (process.platform !== 'linux') {
      expect(restored.x).toBe(bounds.x);
      expect(restored.y).toBe(bounds.y);
    }
  } finally {
    await second.close();
  }
});

test('a window left maximized reopens maximized', async () => {
  // Under xvfb there is no window manager, so nothing can maximize a window.
  test.skip(process.platform === 'linux', 'needs a window manager');
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nubes-e2e-'));

  const first = await launch(userDataPath);
  try {
    await first.firstWindow();
    await first.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
    await expect
      .poll(async () => JSON.parse(String((await readConfig(userDataPath)).windowState ?? 'null')))
      .toMatchObject({ isMaximized: true });
  } finally {
    await first.close();
  }

  const second = await launch(userDataPath);
  try {
    await second.firstWindow();
    await expect.poll(async () => (await windowInfo(second)).isMaximized).toBe(true);
  } finally {
    await second.close();
  }
});

test('a saved dark theme opens dark, behind and in the page', async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nubes-e2e-'));
  await fs.writeFile(
    path.join(userDataPath, 'config.json'),
    JSON.stringify({ themeSource: 'dark' }),
  );

  const app = await launch(userDataPath);
  try {
    const page = await app.firstWindow();
    expect((await windowInfo(app)).backgroundColor).toBe('#0A0A0A');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await expect(page.getByRole('heading', { name: 'Photosets' })).toBeVisible();
    // Mounting the theme provider must not reset the saved theme to 'system'.
    expect(await page.evaluate(() => window.themeMode.current())).toBe('dark');
    expect((await readConfig(userDataPath)).themeSource).toBe('dark');
  } finally {
    await app.close();
  }
});

test('right-click shows edit items in a text field and nothing elsewhere', async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nubes-e2e-'));
  const app = await launch(userDataPath);
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'Photosets' })).toBeVisible();

    // Record the menus main builds instead of opening a native menu, which would block.
    await app.evaluate(({ Menu }) => {
      const record = globalThis as unknown as { builtMenus: string[][] };
      record.builtMenus = [];
      Menu.buildFromTemplate = ((template: Electron.MenuItemConstructorOptions[]) => {
        record.builtMenus.push(template.map((item) => item.role ?? item.label ?? item.type ?? ''));
        return { popup: () => {} };
      }) as unknown as typeof Menu.buildFromTemplate;
    });
    const builtMenus = () =>
      app.evaluate(() => (globalThis as unknown as { builtMenus: string[][] }).builtMenus);

    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'context-menu-probe';
      input.value = 'Joshua Tree';
      // Above the app's layout, so the click lands on it.
      input.style.cssText = 'position:fixed;top:50%;left:50%;z-index:9999';
      document.body.append(input);
      const empty = document.createElement('div');
      empty.id = 'context-menu-empty';
      empty.style.cssText = 'position:fixed;top:10%;left:50%;width:80px;height:80px;z-index:9999';
      document.body.append(empty);
    });
    await page.locator('#context-menu-probe').click({ button: 'right' });
    await expect.poll(builtMenus).toEqual([['cut', 'copy', 'paste', 'separator', 'selectAll']]);

    // An empty spot: no selection, not editable. Main handles right-clicks in order, so if this
    // one built a menu, it would show up before the Copy menu checked below.
    await page.locator('#context-menu-empty').click({ button: 'right' });

    // Selected text outside a field gets Copy. On macOS a right-click on a word selects it.
    await page.evaluate(() => {
      const heading = [...document.querySelectorAll('h1, h2')].find(
        (el) => el.textContent === 'Photosets',
      );
      if (!heading) throw new Error('no Photosets heading');
      window.getSelection()?.selectAllChildren(heading);
    });
    await page.getByRole('heading', { name: 'Photosets' }).click({ button: 'right' });
    await expect
      .poll(builtMenus)
      .toEqual([['cut', 'copy', 'paste', 'separator', 'selectAll'], ['copy']]);
  } finally {
    await app.close();
  }
});
