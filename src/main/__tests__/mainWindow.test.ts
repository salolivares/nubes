import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AWS_REGION,
  IMAGE_PROCESSOR_PROGRESS,
  IMAGE_PROCESSOR_RESIZE,
  STORAGE_CHANGE,
} from '@/common';

/**
 * Covers the macOS reopen path: close the window (the app keeps running), then
 * click the dock icon, which calls restoreOrCreateWindow() again.
 */

const electron = vi.hoisted(() => {
  const handlers = new Map<string, unknown>();
  const sendListeners = new Map<string, (event: unknown, args: unknown) => void>();
  const ports: Array<{ on: ReturnType<typeof vi.fn> }> = [];
  const windows: FakeWindow[] = [];

  class FakeWindow {
    destroyed = false;
    shown = false;
    listeners = new Map<string, () => void>();
    webContents = {
      send: vi.fn(),
      openDevTools: vi.fn(),
      isDestroyed: () => this.destroyed,
      // The app page in the main frame, so ipc.ts's sender check accepts calls from it.
      mainFrame: { url: 'file:///app/renderer/main_window/index.html', parent: null },
    };

    constructor() {
      windows.push(this);
    }

    static getAllWindows() {
      return windows.filter((w) => !w.destroyed);
    }

    static fromWebContents(contents: unknown) {
      return windows.find((w) => w.webContents === contents) ?? null;
    }

    on(event: string, cb: () => void) {
      this.listeners.set(event, cb);
      return this;
    }
    async loadFile() {
      this.listeners.get('ready-to-show')?.();
    }
    async loadURL() {
      this.listeners.get('ready-to-show')?.();
    }
    show() {
      this.shown = true;
    }
    destroy() {
      this.destroyed = true;
    }
    isDestroyed() {
      return this.destroyed;
    }
    isMinimized() {
      return false;
    }
    restore() {}
    focus() {}
  }

  const fakePort = () => ({ start: vi.fn(), on: vi.fn(), postMessage: vi.fn() });

  return {
    handlers,
    sendListeners,
    ports,
    windows,
    FakeWindow,
    fork: vi.fn(() => ({ postMessage: vi.fn(), kill: vi.fn(() => true), on: vi.fn() })),
    appOn: vi.fn(),
    module: {
      BrowserWindow: FakeWindow,
      ipcMain: {
        // Real Electron throws on a second handler for the same channel.
        handle: vi.fn((channel: string, handler: unknown) => {
          if (handlers.has(channel)) {
            throw new Error(`Attempted to register a second handler for '${channel}'`);
          }
          handlers.set(channel, handler);
        }),
        on: vi.fn((channel: string, listener: (event: unknown, args: unknown) => void) => {
          sendListeners.set(channel, listener);
        }),
        removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
      },
      MessageChannelMain: class {
        port1 = fakePort();
        port2 = fakePort();
        constructor() {
          ports.push(this.port1);
        }
      },
      app: { getPath: () => '/tmp/nubes-test', quit: vi.fn() },
      nativeTheme: { themeSource: 'system', shouldUseDarkColors: false },
      dialog: {},
      shell: {},
      clipboard: {},
      safeStorage: { isEncryptionAvailable: () => false },
    },
  };
});

vi.mock('electron', () => ({
  ...electron.module,
  app: { ...electron.module.app, on: electron.appOn },
  utilityProcess: { fork: electron.fork },
}));

vi.mock('electron-log/main', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    default: {
      ...logger,
      scope: () => logger,
      transports: { file: { getFile: () => ({ path: '/tmp/nubes-test/main.log' }) } },
    },
  };
});

vi.mock('sharp', () => ({ default: vi.fn() }));

vi.mock('@/main/drivers/storage', () => ({
  Storage: { instance: { store: { onDidChange: vi.fn() } } },
}));

vi.mock('@/main/drivers/database', () => ({ Database: { instance: {} } }));

vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', '');
vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');

let processListenersBefore: NodeJS.UncaughtExceptionListener[];

beforeEach(() => {
  vi.resetModules();
  electron.handlers.clear();
  electron.sendListeners.clear();
  electron.ports.length = 0;
  electron.windows.length = 0;
  electron.fork.mockClear();
  electron.appOn.mockClear();
  electron.module.ipcMain.handle.mockClear();
  processListenersBefore = process.listeners('uncaughtException');
});

afterEach(() => {
  // registerListeners() hooks the real process; drop what it added.
  for (const listener of process.listeners('uncaughtException')) {
    if (!processListenersBefore.includes(listener)) {
      process.off('uncaughtException', listener);
    }
  }
});

/** Start the app the way index.ts does, then close the window and reopen it. */
async function startThenReopen() {
  const { registerListeners } = await import('@/main/listeners');
  const { restoreOrCreateWindow } = await import('@/main/mainWindow');

  registerListeners();
  await restoreOrCreateWindow();
  electron.windows[0].destroy();
  await restoreOrCreateWindow();

  const [closed, reopened] = electron.windows;
  return { closed, reopened };
}

describe('restoreOrCreateWindow', () => {
  it('reopens a window after the first one is closed', async () => {
    const { restoreOrCreateWindow } = await import('@/main/mainWindow');

    await restoreOrCreateWindow();
    electron.windows[0].destroy();

    await expect(restoreOrCreateWindow()).resolves.toBeUndefined();
    expect(electron.windows).toHaveLength(2);
    expect(electron.windows[1].shown).toBe(true);
  });

  it('registers IPC handlers and the image worker once across windows', async () => {
    const before = process.listenerCount('uncaughtException');
    const { reopened } = await startThenReopen();

    expect(reopened.shown).toBe(true);
    expect(electron.fork).toHaveBeenCalledTimes(1);
    const channels = electron.module.ipcMain.handle.mock.calls.map(([channel]) => channel);
    expect(new Set(channels).size).toBe(channels.length);
    expect(electron.appOn.mock.calls.filter(([event]) => event === 'before-quit')).toHaveLength(1);
    expect(process.listenerCount('uncaughtException')).toBe(before + 1);
  });

  it('pushes storage changes to the reopened window, not the closed one', async () => {
    const { closed, reopened } = await startThenReopen();
    const { Storage } = await import('@/main/drivers/storage');
    const onDidChange = vi.mocked(Storage.instance.store.onDidChange);
    const onRegionChange = onDidChange.mock.calls.find(([key]) => key === AWS_REGION)?.[1];

    onRegionChange?.('eu-west-1', 'us-east-1');

    expect(closed.webContents.send).not.toHaveBeenCalled();
    expect(reopened.webContents.send).toHaveBeenCalledWith(STORAGE_CHANGE, {
      key: AWS_REGION,
      newValue: 'eu-west-1',
      oldValue: 'us-east-1',
    });
  });

  it('sends image progress to the window that asked for the resize', async () => {
    const { closed, reopened } = await startThenReopen();

    electron.sendListeners.get(IMAGE_PROCESSOR_RESIZE)?.(
      { sender: reopened.webContents, senderFrame: reopened.webContents.mainFrame },
      { imagePaths: ['/photos/a.jpg'] },
    );
    const onWorkerMessage = electron.ports[0].on.mock.calls.find(([e]) => e === 'message')?.[1];
    onWorkerMessage({
      data: { type: IMAGE_PROCESSOR_PROGRESS, current: 1, total: 1, path: 'a', name: 'a', id: 'a' },
    });

    expect(closed.webContents.send).not.toHaveBeenCalled();
    expect(reopened.webContents.send).toHaveBeenCalledWith(
      IMAGE_PROCESSOR_PROGRESS,
      expect.objectContaining({ current: 1, total: 1 }),
    );
  });
});
