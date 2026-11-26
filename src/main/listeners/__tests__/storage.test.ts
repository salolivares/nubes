import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACCESS_KEY_ID,
  AWS_REGION,
  CREDENTIALS_CHANGE,
  CREDENTIALS_STATUS_CHANNEL,
  SECRET_ACCESS_KEY,
  SECURE_STORAGE_WRITE,
  STORAGE_CHANGE,
  STORAGE_CHANNEL,
  STORAGE_READ,
  STORAGE_WRITE,
} from '@/common/constants';
import { Storage } from '@/main/drivers/storage';
import { addStorageEventListeners } from '@/main/listeners/storage';

const electron = vi.hoisted(() => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: {
    fromWebContents: vi.fn(() => ({ isDestroyed: () => false })),
    getAllWindows: vi.fn(),
  },
  // No OS keychain: Storage falls back to plain base64. That's the worst case for a leak, so the
  // test checks for the base64 form of the secret too.
  safeStorage: { isEncryptionAvailable: () => false },
}));

vi.mock('electron', () => electron);
vi.mock('electron-log/main', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { default: { scope: () => log } };
});
vi.mock('electron-store', () => {
  type Listener = (newValue?: string, oldValue?: string) => void;
  class MemoryStore {
    private data = new Map<string, string>();
    private listeners = new Map<string, Listener[]>();
    get(key: string) {
      return this.data.get(key);
    }
    set(key: string, value: string) {
      const old = this.data.get(key);
      this.data.set(key, value);
      this.emit(key, value, old);
    }
    delete(key: string) {
      const old = this.data.get(key);
      this.data.delete(key);
      this.emit(key, undefined, old);
    }
    clear() {
      for (const key of [...this.data.keys()]) this.delete(key);
    }
    onDidChange(key: string, listener: Listener) {
      this.listeners.set(key, [...(this.listeners.get(key) ?? []), listener]);
    }
    private emit(key: string, newValue?: string, oldValue?: string) {
      if (newValue === oldValue) return;
      for (const listener of this.listeners.get(key) ?? []) listener(newValue, oldValue);
    }
  }
  return { default: MemoryStore };
});

const ACCESS_KEY = 'AKIA1234567890ABCDEF';
const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const SECRET_FORMS = [SECRET, Buffer.from(SECRET).toString('base64')];

const send = vi.fn();
const mainFrame = { url: 'nubes://app/index.html', parent: null };
const trustedEvent = { sender: { mainFrame }, senderFrame: mainFrame };

type Handler = (event: unknown, args?: unknown) => Promise<unknown>;

function handlerFor(channel: string): Handler {
  const call = electron.ipcMain.handle.mock.calls.find(([name]) => name === channel);
  if (!call) throw new Error(`No handler registered for ${channel}`);
  return call[1] as Handler;
}

/** Every value that crossed IPC toward the renderer: invoke results and pushes. */
const sentToRenderer: unknown[] = [];

async function invoke(channel: string, args?: unknown) {
  const result = await handlerFor(channel)(trustedEvent, args);
  sentToRenderer.push(result);
  return result;
}

function expectNoSecret() {
  const everything = JSON.stringify([...sentToRenderer, ...send.mock.calls]);
  for (const form of SECRET_FORMS) {
    expect(everything).not.toContain(form);
  }
}

beforeAll(() => {
  vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', undefined);
  electron.BrowserWindow.getAllWindows.mockReturnValue([
    { isDestroyed: () => false, webContents: { send } },
  ]);
  addStorageEventListeners();
});

beforeEach(() => {
  Storage.instance.store.clear();
  send.mockClear();
  sentToRenderer.length = 0;
});

async function saveCredentials() {
  await invoke(STORAGE_CHANNEL, {
    action: SECURE_STORAGE_WRITE,
    key: ACCESS_KEY_ID,
    value: ACCESS_KEY,
  });
  await invoke(STORAGE_CHANNEL, {
    action: SECURE_STORAGE_WRITE,
    key: SECRET_ACCESS_KEY,
    value: SECRET,
  });
  await invoke(STORAGE_CHANNEL, { action: STORAGE_WRITE, key: AWS_REGION, value: 'eu-west-1' });
}

describe('storage listener', () => {
  it('saves the secret but never sends it back over IPC', async () => {
    await saveCredentials();

    // Main can still read it, so S3 calls authenticate.
    expect(Storage.instance.secureRead(SECRET_ACCESS_KEY)).toBe(SECRET);

    await expect(invoke(CREDENTIALS_STATUS_CHANNEL)).resolves.toEqual({
      accessKeyId: ACCESS_KEY,
      hasSecret: true,
    });
    await expect(invoke(STORAGE_CHANNEL, { action: STORAGE_READ, key: AWS_REGION })).resolves.toBe(
      'eu-west-1',
    );

    // Pushes carry the status shape for credentials, and the plain value for the region.
    expect(send).toHaveBeenCalledWith(CREDENTIALS_CHANGE, {
      accessKeyId: ACCESS_KEY,
      hasSecret: true,
    });
    expect(send).toHaveBeenCalledWith(STORAGE_CHANGE, {
      key: AWS_REGION,
      newValue: 'eu-west-1',
      oldValue: '',
    });

    expectNoSecret();
  });

  it('reports a missing secret', async () => {
    await expect(invoke(CREDENTIALS_STATUS_CHANNEL)).resolves.toEqual({
      accessKeyId: null,
      hasSecret: false,
    });
  });

  it('has no secure read action', async () => {
    await saveCredentials();

    await expect(
      invoke(STORAGE_CHANNEL, { action: 'secure-storage:read', key: SECRET_ACCESS_KEY }),
    ).rejects.toThrow();
    expectNoSecret();
  });

  it.each([ACCESS_KEY_ID, SECRET_ACCESS_KEY])('refuses a plain read of %s', async (key) => {
    await saveCredentials();

    await expect(invoke(STORAGE_CHANNEL, { action: STORAGE_READ, key })).rejects.toThrow();
    expectNoSecret();
  });

  it.each([ACCESS_KEY_ID, SECRET_ACCESS_KEY])('refuses a plain write of %s', async (key) => {
    await saveCredentials();

    await expect(
      invoke(STORAGE_CHANNEL, { action: STORAGE_WRITE, key, value: 'overwritten' }),
    ).rejects.toThrow();
    expect(Storage.instance.secureRead(SECRET_ACCESS_KEY)).toBe(SECRET);
  });

  it('refuses a secure write to a non-credential key', async () => {
    await expect(
      invoke(STORAGE_CHANNEL, { action: SECURE_STORAGE_WRITE, key: AWS_REGION, value: 'x' }),
    ).rejects.toThrow();
  });
});
