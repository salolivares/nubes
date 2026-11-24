import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AWS_REGION,
  IMAGE_PROCESSOR_EVENT,
  IMAGE_PROCESSOR_RESIZE,
  STORAGE_CHANGE,
} from '@/common';
import type { ImageJob } from '@/common/types';
import type * as Guards from '@/main/media/guards';

/**
 * Covers the macOS reopen path: close the window (the app keeps running), then
 * click the dock icon, which calls restoreOrCreateWindow() again.
 */

const electron = vi.hoisted(() => {
  const handlers = new Map<string, unknown>();
  const sendListeners = new Map<string, (event: unknown, args: unknown) => void>();
  const windows: FakeWindow[] = [];

  class FakeWindow {
    destroyed = false;
    shown = false;
    shownInactive = false;
    focused = false;
    listeners = new Map<string, () => void>();
    contentsListeners = new Map<string, () => void>();
    webContents = {
      send: vi.fn(),
      openDevTools: vi.fn(),
      isDestroyed: () => this.destroyed,
      on: (event: string, cb: () => void) => this.contentsListeners.set(event, cb),
      once: (event: string, cb: () => void) => this.contentsListeners.set(event, cb),
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
    showInactive() {
      this.shownInactive = true;
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
    focus() {
      this.focused = true;
    }
  }

  return {
    handlers,
    sendListeners,
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

// These tests use made-up source paths. The path checks have their own tests.
vi.mock('@/main/media/guards', async (importOriginal) => ({
  ...(await importOriginal<typeof Guards>()),
  assertResizePaths: vi.fn(async () => {}),
}));

vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', '');
vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');

let processListenersBefore: NodeJS.UncaughtExceptionListener[];

beforeEach(() => {
  vi.resetModules();
  electron.handlers.clear();
  electron.sendListeners.clear();
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

  it('opens a background window without showing it active or focusing it', async () => {
    const { restoreOrCreateWindow } = await import('@/main/mainWindow');

    await restoreOrCreateWindow({ background: true });

    const [window] = electron.windows;
    expect(window.shownInactive).toBe(true);
    expect(window.shown).toBe(false);
    expect(window.focused).toBe(false);
  });

  it('registers IPC handlers and the image worker once across windows', async () => {
    const before = process.listenerCount('uncaughtException');
    const { reopened } = await startThenReopen();

    expect(reopened.shown).toBe(true);
    // The worker forks on the first resize request, not at startup.
    expect(electron.fork).not.toHaveBeenCalled();
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

  it('forks one worker and sends job events to open windows only', async () => {
    const { closed, reopened } = await startThenReopen();
    const resize = electron.handlers.get(IMAGE_PROCESSOR_RESIZE) as (
      event: unknown,
      args: unknown,
    ) => Promise<ImageJob>;

    const sender = { sender: reopened.webContents, senderFrame: reopened.webContents.mainFrame };
    const job = await resize(sender, { imagePaths: ['/photos/a.jpg'] });
    await resize(sender, { imagePaths: ['/photos/b.jpg'] });
    expect(electron.fork).toHaveBeenCalledTimes(1);

    const worker = electron.fork.mock.results[0].value;
    const onWorkerMessage = worker.on.mock.calls.find(([e]: [string]) => e === 'message')?.[1];
    onWorkerMessage({
      type: 'progress',
      jobId: job.jobId,
      current: 1,
      total: 1,
      path: '/photos/a.jpg',
      name: 'a.jpg',
    });

    expect(closed.webContents.send).not.toHaveBeenCalled();
    expect(reopened.webContents.send).toHaveBeenCalledWith(
      IMAGE_PROCESSOR_EVENT,
      expect.objectContaining({ type: 'progress', jobId: job.jobId, current: 1 }),
    );
  });

  it("cancels a window's jobs when it reloads, so they don't hold up the queue", async () => {
    const { reopened } = await startThenReopen();
    const resize = electron.handlers.get(IMAGE_PROCESSOR_RESIZE) as (
      event: unknown,
      args: unknown,
    ) => Promise<ImageJob>;
    const sender = { sender: reopened.webContents, senderFrame: reopened.webContents.mainFrame };
    const running = await resize(sender, { imagePaths: ['/photos/a.jpg'] });
    const queued = await resize(sender, { imagePaths: ['/photos/b.jpg'] });

    reopened.contentsListeners.get('did-navigate')?.();

    const worker = electron.fork.mock.results[0].value;
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'cancel', jobId: running.jobId });
    expect(reopened.webContents.send).toHaveBeenCalledWith(
      IMAGE_PROCESSOR_EVENT,
      expect.objectContaining({ type: 'complete', jobId: queued.jobId, cancelled: true }),
    );
  });
});
