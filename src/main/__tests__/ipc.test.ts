import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handle, isAppUrl, isTrustedSender, on } from '@/main/ipc';

const electron = vi.hoisted(() => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn() },
}));

vi.mock('electron', () => electron);
vi.mock('electron-log/main', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { default: { scope: () => log } };
});

const APP_URL = 'nubes://app/index.html#/settings';

interface FakeEventOptions {
  url?: string;
  subframe?: boolean;
  inWindow?: boolean;
  frameGone?: boolean;
}

function fakeEvent({
  url = APP_URL,
  subframe = false,
  inWindow = true,
  frameGone = false,
}: FakeEventOptions = {}) {
  const mainFrame = { url, parent: null };
  const senderFrame = subframe ? { url, parent: mainFrame } : mainFrame;
  const sender = { id: inWindow ? 1 : 2, mainFrame };
  return {
    sender,
    senderFrame: frameGone ? null : senderFrame,
  } as unknown as Electron.IpcMainInvokeEvent;
}

function lastRegistered(mock: typeof electron.ipcMain.handle) {
  return mock.mock.calls.at(-1)![1] as (event: unknown, args: unknown) => unknown;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', undefined);
  electron.BrowserWindow.fromWebContents.mockImplementation((contents: { id: number }) =>
    contents.id === 1 ? { isDestroyed: () => false } : null,
  );
});

describe('isTrustedSender', () => {
  it("accepts the main window's main frame showing the app page", () => {
    expect(isTrustedSender(fakeEvent())).toBe(true);
  });

  it('rejects a subframe', () => {
    expect(isTrustedSender(fakeEvent({ subframe: true }))).toBe(false);
  });

  it('rejects webContents that belong to no BrowserWindow', () => {
    expect(isTrustedSender(fakeEvent({ inWindow: false }))).toBe(false);
  });

  it('rejects a destroyed frame', () => {
    expect(isTrustedSender(fakeEvent({ frameGone: true }))).toBe(false);
  });

  it('rejects a remote page in a packaged build', () => {
    expect(isTrustedSender(fakeEvent({ url: 'https://evil.example/' }))).toBe(false);
  });

  it('accepts only the dev server origin in dev', () => {
    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', 'http://localhost:5173');
    expect(isTrustedSender(fakeEvent({ url: 'http://localhost:5173/#/' }))).toBe(true);
    expect(isTrustedSender(fakeEvent({ url: 'http://localhost:6000/' }))).toBe(false);
    expect(isTrustedSender(fakeEvent({ url: APP_URL }))).toBe(false);
  });
});

describe('isAppUrl', () => {
  it('trusts nubes://app pages in a packaged build', () => {
    expect(isAppUrl('nubes://app/index.html', '')).toBe(true);
    expect(isAppUrl('nubes://app/', '')).toBe(true);
    expect(isAppUrl('nubes://app/index.html#/photoset/3/upload', '')).toBe(true);
  });

  it('rejects file: pages, which used to be trusted', () => {
    expect(isAppUrl('file:///Applications/Nubes.app/renderer/main_window/index.html', '')).toBe(
      false,
    );
    expect(isAppUrl('file:///Users/me/Downloads/evil.html', '')).toBe(false);
  });

  it('rejects other hosts, schemes and lookalikes', () => {
    for (const url of [
      'nubes://evil/index.html',
      'nubes://app.evil/index.html',
      'nubes://app:8080/index.html',
      'nubes://user@app/index.html',
      'nubes-media://media/%2Ftmp%2Fa.jpg',
      'https://app/index.html',
      'http://localhost:5173/',
      'data:text/html,<p>hi',
      'about:blank',
      'not a url',
      '',
    ]) {
      expect(isAppUrl(url, ''), url).toBe(false);
    }
  });

  it('trusts only the dev server origin in dev, not nubes://app', () => {
    const dev = 'http://localhost:5173';
    expect(isAppUrl('http://localhost:5173/#/settings', dev)).toBe(true);
    expect(isAppUrl('http://localhost:5174/', dev)).toBe(false);
    expect(isAppUrl('http://127.0.0.1:5173/', dev)).toBe(false);
    expect(isAppUrl('nubes://app/index.html', dev)).toBe(false);
    expect(isAppUrl('file:///index.html', dev)).toBe(false);
  });
});

describe('handle()', () => {
  it('runs the handler for a trusted sender', async () => {
    const handler = vi.fn().mockReturnValue('ok');
    handle('test:handle', handler);

    await expect(lastRegistered(electron.ipcMain.handle)(fakeEvent(), 'x')).resolves.toBe('ok');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('rejects an untrusted sender without running the handler', async () => {
    const handler = vi.fn();
    handle('test:handle', handler);

    await expect(
      lastRegistered(electron.ipcMain.handle)(fakeEvent({ subframe: true }), 'x'),
    ).rejects.toThrow('Untrusted IPC sender');
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('on()', () => {
  it('runs the handler for a trusted sender', () => {
    const handler = vi.fn();
    on('test:on', handler);

    lastRegistered(electron.ipcMain.on)(fakeEvent(), 'x');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('drops a message from an untrusted sender', () => {
    const handler = vi.fn();
    on('test:on', handler);

    lastRegistered(electron.ipcMain.on)(fakeEvent({ inWindow: false }), 'x');
    expect(handler).not.toHaveBeenCalled();
  });
});
