import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  backupDatabase,
  backupPath,
  isCorruptionError,
  listBackups,
  MAX_BACKUPS,
  pruneBackups,
} from '@/main/drivers/database-maintenance';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
// A database left at migration 0000, with two photosets. See scripts/create-e2e-fixture-db.ts.
const FIXTURE_DB = path.join(REPO_ROOT, 'tests/e2e/fixtures/nubes-0000.db');

const electron = vi.hoisted(() => ({
  userData: '',
  showErrorBox: vi.fn(),
  quit: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => electron.userData,
    getAppPath: () => REPO_ROOT,
    quit: electron.quit,
  },
  dialog: { showErrorBox: electron.showErrorBox },
}));

vi.mock('electron-log/main', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { default: { ...logger, scope: () => logger } };
});

let userData: string;
let dbPath: string;
const opened: BetterSqlite3.Database[] = [];

beforeEach(() => {
  vi.resetModules();
  electron.showErrorBox.mockClear();
  electron.quit.mockClear();
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'nubes-db-test-'));
  electron.userData = userData;
  dbPath = path.join(userData, 'nubes.db');
});

afterEach(() => {
  for (const sqlite of opened.splice(0)) {
    if (sqlite.open) sqlite.close();
  }
  fs.rmSync(userData, { recursive: true, force: true });
});

/** Boot the Database singleton fresh, the way the app does at startup. */
async function openDatabase(): Promise<BetterSqlite3.Database> {
  const { Database } = await import('@/main/drivers/database');
  const sqlite = (Database.instance.db as unknown as { $client: BetterSqlite3.Database }).$client;
  opened.push(sqlite);
  return sqlite;
}

function closeAll() {
  for (const sqlite of opened.splice(0)) sqlite.close();
}

function writeFakeBackups(stamps: string[]) {
  for (const stamp of stamps) {
    fs.writeFileSync(backupPath(dbPath, new Date(stamp)), 'old');
  }
}

describe('Database', () => {
  it('sets WAL, synchronous NORMAL, busy_timeout and foreign keys', async () => {
    const sqlite = await openDatabase();

    expect(sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    // 1 is NORMAL.
    expect(sqlite.pragma('synchronous', { simple: true })).toBe(1);
    expect(sqlite.pragma('busy_timeout', { simple: true })).toBe(5000);
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('does not back up a brand new database', async () => {
    await openDatabase();

    expect(listBackups(dbPath)).toEqual([]);
  });

  it('does not back up when no migrations are pending', async () => {
    await openDatabase();
    closeAll();
    vi.resetModules();

    await openDatabase();

    expect(listBackups(dbPath)).toEqual([]);
  });

  it('backs up the pre-migration database when migrations are pending', async () => {
    fs.copyFileSync(FIXTURE_DB, dbPath);

    await openDatabase();

    const backups = listBackups(dbPath);
    expect(backups).toHaveLength(1);
    // The backup is the 0000 database, before 0001 to 0003 ran.
    const backup = new BetterSqlite3(backups[0], { readonly: true });
    opened.push(backup);
    const { count } = backup
      .prepare('SELECT count(*) AS count FROM __drizzle_migrations')
      .get() as {
      count: number;
    };
    expect(count).toBe(1);
    expect(backup.prepare('SELECT count(*) AS count FROM photosets').get()).toEqual({ count: 2 });
  });

  it(`keeps only the newest ${MAX_BACKUPS} backups after backing up`, async () => {
    fs.copyFileSync(FIXTURE_DB, dbPath);
    writeFakeBackups(['2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z', '2020-01-03T00:00:00Z']);

    await openDatabase();

    const backups = listBackups(dbPath).map((file) => path.basename(file));
    expect(backups).toHaveLength(MAX_BACKUPS);
    expect(backups).not.toContain(
      path.basename(backupPath(dbPath, new Date('2020-01-01T00:00:00Z'))),
    );
    expect(backups[0]).toBe(path.basename(backupPath(dbPath, new Date('2020-01-02T00:00:00Z'))));
  });

  it('shows a dialog naming the latest backup when the database is corrupt', async () => {
    writeFakeBackups(['2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z']);
    fs.writeFileSync(dbPath, 'this is not a sqlite database'.repeat(200));

    await expect(openDatabase()).rejects.toSatisfy(isCorruptionError);

    expect(electron.showErrorBox).toHaveBeenCalledOnce();
    const [, message] = electron.showErrorBox.mock.calls[0];
    expect(message).toContain(backupPath(dbPath, new Date('2020-01-02T00:00:00Z')));
    expect(electron.quit).toHaveBeenCalledOnce();
  });
});

describe('backupDatabase', () => {
  it('includes writes that are still in the WAL file', () => {
    const sqlite = new BetterSqlite3(dbPath);
    opened.push(sqlite);
    sqlite.pragma('journal_mode = WAL');
    // Keep every commit in the -wal file so a raw copy of nubes.db would miss it.
    sqlite.pragma('wal_autocheckpoint = 0');
    sqlite.exec('CREATE TABLE t (v TEXT)');
    sqlite.prepare('INSERT INTO t VALUES (?)').run('in the wal');
    expect(fs.statSync(`${dbPath}-wal`).size).toBeGreaterThan(0);

    const target = backupDatabase(sqlite, dbPath, new Date('2026-01-01T00:00:00Z'));

    const backup = new BetterSqlite3(target, { readonly: true });
    opened.push(backup);
    expect(backup.prepare('SELECT v FROM t').all()).toEqual([{ v: 'in the wal' }]);
  });
});

describe('pruneBackups', () => {
  it('deletes the oldest backups beyond the limit and leaves other files alone', () => {
    writeFakeBackups([
      '2026-01-04T00:00:00Z',
      '2026-01-01T00:00:00Z',
      '2026-01-03T00:00:00Z',
      '2026-01-05T00:00:00Z',
      '2026-01-02T00:00:00Z',
    ]);
    fs.writeFileSync(dbPath, '');
    fs.writeFileSync(`${dbPath}-wal`, '');
    fs.writeFileSync(path.join(userData, 'other.db.bak-2000-01-01T00-00-00-000Z'), '');

    const deleted = pruneBackups(dbPath, 3);

    expect(deleted.map((file) => path.basename(file))).toEqual([
      'nubes.db.bak-2026-01-01T00-00-00-000Z',
      'nubes.db.bak-2026-01-02T00-00-00-000Z',
    ]);
    expect(fs.readdirSync(userData).sort()).toEqual([
      'nubes.db',
      'nubes.db-wal',
      'nubes.db.bak-2026-01-03T00-00-00-000Z',
      'nubes.db.bak-2026-01-04T00-00-00-000Z',
      'nubes.db.bak-2026-01-05T00-00-00-000Z',
      'other.db.bak-2000-01-01T00-00-00-000Z',
    ]);
  });

  it('does nothing when there are fewer backups than the limit', () => {
    writeFakeBackups(['2026-01-01T00:00:00Z']);

    expect(pruneBackups(dbPath, 3)).toEqual([]);
    expect(listBackups(dbPath)).toHaveLength(1);
  });
});
