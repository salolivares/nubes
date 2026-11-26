import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { DrizzleError } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  backupDatabase,
  backupPath,
  corruptionMessage,
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
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => electron.userData,
    getAppPath: () => REPO_ROOT,
  },
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

/** Overwrite the root page of `table` with garbage, leaving page 1 (the schema) intact. */
function corruptTablePage(file: string, table: string) {
  const sqlite = new BetterSqlite3(file);
  const pageSize = sqlite.pragma('page_size', { simple: true }) as number;
  const { rootpage } = sqlite
    .prepare('SELECT rootpage FROM sqlite_master WHERE name = ?')
    .get(table) as { rootpage: number };
  sqlite.close();
  expect(rootpage).toBeGreaterThan(1);
  const fd = fs.openSync(file, 'r+');
  fs.writeSync(fd, Buffer.alloc(pageSize, 0xff), 0, pageSize, (rootpage - 1) * pageSize);
  fs.closeSync(fd);
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

  it('throws a user-facing error naming the latest backup when the database is corrupt', async () => {
    writeFakeBackups(['2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z']);
    fs.writeFileSync(dbPath, 'this is not a sqlite database'.repeat(200));

    const error = await openDatabase().catch((e: unknown) => e);

    // index.ts's error handler shows it and quits. The driver shows no dialog of its own.
    // Compared by name: vi.resetModules() gives the driver its own copy of the class.
    expect(error).toMatchObject({ name: 'UserFacingError', title: 'Nubes database is corrupt' });
    expect(isCorruptionError(error)).toBe(true);
    expect((error as Error).message).toContain(
      backupPath(dbPath, new Date('2020-01-02T00:00:00Z')),
    );
  });

  it('leaves no partial backup when the snapshot hits a corrupt page', async () => {
    fs.copyFileSync(FIXTURE_DB, dbPath);
    corruptTablePage(dbPath, 'photoset_images');
    writeFakeBackups(['2020-01-01T00:00:00Z']);

    const error = await openDatabase().catch((e: unknown) => e);
    expect(isCorruptionError(error)).toBe(true);

    // Only the older good backup remains, no staging file, and the message points at it.
    expect(fs.readdirSync(userData).filter((name) => name.includes('.bak-'))).toEqual([
      path.basename(backupPath(dbPath, new Date('2020-01-01T00:00:00Z'))),
    ]);
    expect((error as Error).message).toContain(
      backupPath(dbPath, new Date('2020-01-01T00:00:00Z')),
    );
  });
});

describe('isCorruptionError', () => {
  it('matches SqliteError codes and Drizzle-wrapped ones', () => {
    const corrupt = Object.assign(new Error('malformed'), { code: 'SQLITE_CORRUPT' });

    expect(isCorruptionError(corrupt)).toBe(true);
    expect(isCorruptionError({ code: 'SQLITE_CORRUPT_INDEX' })).toBe(true);
    expect(isCorruptionError({ code: 'SQLITE_NOTADB' })).toBe(true);
    expect(isCorruptionError(new DrizzleError({ message: 'migrate', cause: corrupt }))).toBe(true);
    expect(isCorruptionError({ code: 'SQLITE_BUSY' })).toBe(false);
    expect(isCorruptionError(new Error('nope'))).toBe(false);
    expect(isCorruptionError(undefined)).toBe(false);
  });
});

describe('corruptionMessage', () => {
  it('says when there is no backup', () => {
    expect(corruptionMessage(dbPath, undefined)).toContain('No backup was found');
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
    // Not backups: a sidecar from opening one, a hand-made copy, and a folder.
    fs.writeFileSync(path.join(userData, 'nubes.db.bak-2026-01-05T00-00-00-000Z-wal'), '');
    fs.writeFileSync(path.join(userData, 'nubes.db.bak-manual'), '');
    fs.mkdirSync(path.join(userData, 'nubes.db.bak-old'));

    const { deleted, failed } = pruneBackups(dbPath, 3);

    expect(failed).toEqual([]);
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
      'nubes.db.bak-2026-01-05T00-00-00-000Z-wal',
      'nubes.db.bak-manual',
      'nubes.db.bak-old',
      'other.db.bak-2000-01-01T00-00-00-000Z',
    ]);
  });

  it('does nothing when there are fewer backups than the limit', () => {
    writeFakeBackups(['2026-01-01T00:00:00Z']);

    expect(pruneBackups(dbPath, 3)).toEqual({ deleted: [], failed: [] });
    expect(listBackups(dbPath)).toHaveLength(1);
  });
});
