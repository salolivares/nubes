import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GITHUB_CLEAR_TOKEN,
  GITHUB_SAVE_SETTINGS,
  GITHUB_SETTINGS,
  GITHUB_TEST_CONNECTION,
  GITHUB_TOKEN,
  STORAGE_CHANNEL,
  STORAGE_READ,
} from '@/common/constants';
import type * as schema from '@/common/db/schema';
import { photosetImages, photosets } from '@/common/db/schema';
import { createTestDb } from '@/main/__test-utils__/db';
import type { IGitHubProvider } from '@/main/drivers/github';
import {
  enableMockGitHub,
  getGitHubProvider,
  GitHubError,
  MockGitHub,
} from '@/main/drivers/github';
import { Storage } from '@/main/drivers/storage';
import { addGitHubEventListeners, openAlbumPullRequest } from '@/main/listeners/github';
import { addStorageEventListeners } from '@/main/listeners/storage';

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'nubes-github-listener-'));

const electron = vi.hoisted(() => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: {
    fromWebContents: vi.fn(() => ({ isDestroyed: () => false })),
    getAllWindows: vi.fn(() => []),
  },
  // A stand-in keychain. Main refuses to save the token without one.
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`enc:${[...value].reverse().join('')}`),
    decryptString: (data: Buffer) => [...data.toString().slice(4)].reverse().join(''),
  },
  app: { getPath: vi.fn() },
}));

vi.mock('electron', () => electron);
vi.mock('electron-log/main', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { default: { scope: () => log } };
});
vi.mock('electron-store', () => {
  class MemoryStore {
    private data = new Map<string, string>();
    get(key: string) {
      return this.data.get(key);
    }
    set(key: string, value: string) {
      this.data.set(key, value);
    }
    delete(key: string) {
      this.data.delete(key);
    }
    clear() {
      this.data.clear();
    }
    onDidChange() {}
  }
  return { default: MemoryStore };
});

const TOKEN = 'github_pat_11ABCDEFG0123456789_secretsecretsecretsecret';
const TOKEN_FORMS = [TOKEN, Buffer.from(TOKEN).toString('base64')];

const mainFrame = { url: 'nubes://app/index.html', parent: null };
const trustedEvent = { sender: { mainFrame }, senderFrame: mainFrame };
const sentToRenderer: unknown[] = [];

async function invoke(channel: string, args?: unknown) {
  const call = electron.ipcMain.handle.mock.calls.find(([name]) => name === channel);
  if (!call) throw new Error(`No handler registered for ${channel}`);
  const result = await (call[1] as (e: unknown, a: unknown) => Promise<unknown>)(
    trustedEvent,
    args,
  );
  sentToRenderer.push(result);
  return result;
}

function expectNoToken() {
  const everything = JSON.stringify(sentToRenderer);
  for (const form of TOKEN_FORMS) expect(everything).not.toContain(form);
}

let db: BetterSQLite3Database<typeof schema>;
let close: () => void;

beforeAll(() => {
  vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', undefined);
  electron.app.getPath.mockReturnValue(userData);
  ({ db, close } = createTestDb());
  addGitHubEventListeners();
  addStorageEventListeners();
});

afterAll(() => {
  close();
  fs.rmSync(userData, { recursive: true, force: true });
});

beforeEach(() => {
  Storage.instance.store.clear();
  sentToRenderer.length = 0;
  db.delete(photosetImages).run();
  db.delete(photosets).run();
  fs.rmSync(path.join(userData, 'mock-github'), { recursive: true, force: true });
  enableMockGitHub();
});

describe('GitHub settings IPC', () => {
  it('saves the token encrypted and only ever reports whether one is saved', async () => {
    await expect(
      invoke(GITHUB_SAVE_SETTINGS, {
        token: TOKEN,
        repo: 'salolivares/salolivares.com',
        baseBranch: 'master',
      }),
    ).resolves.toEqual({
      hasToken: true,
      repo: 'salolivares/salolivares.com',
      baseBranch: 'master',
      mock: true,
    });
    // Main can still read it, so requests authenticate.
    expect(Storage.instance.secureRead(GITHUB_TOKEN)).toBe(TOKEN);

    // An empty token keeps the saved one.
    await invoke(GITHUB_SAVE_SETTINGS, { token: '', repo: 'me/site', baseBranch: 'main' });
    expect(Storage.instance.secureRead(GITHUB_TOKEN)).toBe(TOKEN);
    await expect(invoke(GITHUB_SETTINGS)).resolves.toMatchObject({
      hasToken: true,
      repo: 'me/site',
      baseBranch: 'main',
    });
    await invoke(GITHUB_TEST_CONNECTION);

    // Neither the plain storage channel nor anything above returns it.
    await expect(
      invoke(STORAGE_CHANNEL, { action: STORAGE_READ, key: GITHUB_TOKEN }),
    ).rejects.toThrow();
    expectNoToken();

    await expect(invoke(GITHUB_CLEAR_TOKEN)).resolves.toMatchObject({ hasToken: false });
    expect(Storage.instance.secureRead(GITHUB_TOKEN)).toBeNull();
  });

  it('refuses to save the token when the keychain is unavailable', async () => {
    const canEncrypt = vi.spyOn(Storage.instance, 'canEncrypt', 'get').mockReturnValue(false);
    await expect(
      invoke(GITHUB_SAVE_SETTINGS, { token: TOKEN, repo: 'a/b', baseBranch: 'master' }),
    ).rejects.toThrow(/keychain/);
    expect(Storage.instance.store.get(GITHUB_TOKEN)).toBeUndefined();
    canEncrypt.mockRestore();
  });

  it('defaults to the site repo and master', async () => {
    await expect(invoke(GITHUB_SETTINGS)).resolves.toEqual({
      hasToken: false,
      repo: 'salolivares/salolivares.com',
      baseBranch: 'master',
      mock: true,
    });
  });

  it.each([
    [{ token: 'ghp_classicclassicclassicclassic1234', repo: 'a/b', baseBranch: 'master' }],
    [{ repo: 'not a repo', baseBranch: 'master' }],
    [{ repo: 'a/b', baseBranch: '../etc' }],
    [{ repo: 'a/b', baseBranch: 'master?ref=x' }],
  ])('rejects %j', async (args) => {
    await expect(invoke(GITHUB_SAVE_SETTINGS, args)).rejects.toThrow();
    expect(Storage.instance.secureRead(GITHUB_TOKEN)).toBeNull();
  });
});

describe('openAlbumPullRequest', () => {
  function uploadedPhotoset(overrides: Partial<typeof photosets.$inferInsert> = {}) {
    const [row] = db
      .insert(photosets)
      .values({
        name: 'Trip',
        location: 'Big Sur',
        description: 'A drive up the coast.',
        year: 2024,
        bucketName: 'photos',
        uploadedAt: new Date().toISOString(),
        ...overrides,
      })
      .returning()
      .all();
    db.insert(photosetImages)
      .values([
        { photosetId: row.id, name: 'Dawn', originalPath: '/x/b.jpg', sortOrder: 1 },
        {
          photosetId: row.id,
          name: 'Sunset',
          camera: 'X100',
          originalPath: '/x/a.jpg',
          sortOrder: 0,
        },
      ])
      .run();
    return row;
  }

  it('commits the JSON from the DB row and records the PR URL', async () => {
    const { id } = uploadedPhotoset();
    const provider = getGitHubProvider() as MockGitHub;

    const result = await openAlbumPullRequest(db, provider, id);

    expect(result).toEqual({
      ok: true,
      pullRequest: {
        url: 'https://github.com/salolivares/salolivares.com/pull/mock-1',
        number: 1,
        created: true,
        mock: true,
      },
    });
    const [row] = db.select().from(photosets).where(eq(photosets.id, id)).all();
    expect(row.pullRequestUrl).toBe('https://github.com/salolivares/salolivares.com/pull/mock-1');
    const state = await provider.readState();
    const file = state.branches['photos/2024-big-sur']['src/content/travel/2024-big-sur.json'];
    expect(JSON.parse(file)).toMatchObject({
      title: 'Trip',
      year: 2024,
      images: [{ id: 'sunset', camera: 'X100' }, { id: 'dawn' }],
    });
  });

  it('reuses the PR when the same album is published again', async () => {
    const { id } = uploadedPhotoset();
    const provider = getGitHubProvider();

    await openAlbumPullRequest(db, provider, id);
    db.update(photosets).set({ description: 'Edited.' }).where(eq(photosets.id, id)).run();
    const again = await openAlbumPullRequest(db, provider, id);

    expect(again).toMatchObject({ ok: true, pullRequest: { number: 1, created: false } });
    const state = await (provider as MockGitHub).readState();
    expect(state.pulls).toHaveLength(1);
  });

  it('runs publishes for the same album one at a time, each with its own row', async () => {
    const first = uploadedPhotoset();
    // Same year and location, so the same album id and branch, but different JSON.
    const second = uploadedPhotoset({ name: 'Trip, again' });
    let running = 0;
    const titles: string[] = [];
    const publishAlbum = vi.fn(async (album: { title: string }) => {
      running++;
      expect(running).toBe(1);
      await new Promise((resolve) => setImmediate(resolve));
      titles.push(album.title);
      running--;
      return { url: 'https://github.com/o/r/pull/1', number: 1, created: false, mock: false };
    });
    const provider: IGitHubProvider = { mock: false, testConnection: vi.fn(), publishAlbum };

    const results = await Promise.all([
      openAlbumPullRequest(db, provider, first.id),
      openAlbumPullRequest(db, provider, second.id),
    ]);

    expect(results.every((r) => r.ok)).toBe(true);
    expect(titles).toEqual(['Trip', 'Trip, again']);
    for (const { id } of [first, second]) {
      const [row] = db.select().from(photosets).where(eq(photosets.id, id)).all();
      expect(row.pullRequestUrl).toBe('https://github.com/o/r/pull/1');
    }
  });

  it('keeps the mock state whole when two albums publish at once', async () => {
    const provider = getGitHubProvider() as MockGitHub;
    const publish = (albumId: string) =>
      provider.publishAlbum({ albumId, title: albumId, content: '{}\n', bucketName: 'b' });

    const prs = await Promise.all([publish('2024-a'), publish('2024-b')]);

    expect(prs.map((pr) => pr.number).sort()).toEqual([1, 2]);
    expect((await provider.readState()).pulls).toHaveLength(2);
  });

  it('returns GitHub problems as a retryable error and leaves the row alone', async () => {
    const { id } = uploadedPhotoset();
    const provider: IGitHubProvider = {
      mock: false,
      testConnection: vi.fn(),
      publishAlbum: vi.fn().mockRejectedValue(new GitHubError('GitHub rejected the token.')),
    };

    await expect(openAlbumPullRequest(db, provider, id)).resolves.toEqual({
      ok: false,
      error: 'GitHub rejected the token.',
    });
    const [row] = db.select().from(photosets).where(eq(photosets.id, id)).all();
    expect(row.pullRequestUrl).toBeNull();
    expect(row.uploadedAt).not.toBeNull();
  });

  it('refuses a photoset that was never uploaded', async () => {
    const { id } = uploadedPhotoset({ uploadedAt: null });
    const publishAlbum = vi.fn();
    const result = await openAlbumPullRequest(
      db,
      { mock: false, testConnection: vi.fn(), publishAlbum },
      id,
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining('Upload the images') });
    expect(publishAlbum).not.toHaveBeenCalled();
  });
});

describe('dev mode', () => {
  it('uses the mock, which never calls fetch', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    enableMockGitHub();
    const provider = getGitHubProvider();
    expect(provider).toBeInstanceOf(MockGitHub);
    expect(provider.mock).toBe(true);

    await provider.testConnection();
    await provider.publishAlbum({
      albumId: '2024-x',
      title: 'X',
      content: '{}\n',
      bucketName: 'b',
    });

    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});
