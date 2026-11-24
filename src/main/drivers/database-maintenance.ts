import fs from 'node:fs';
import path from 'node:path';

import type BetterSqlite3 from 'better-sqlite3';
import type { MigrationMeta } from 'drizzle-orm/migrator';

/** How many pre-migration backups to keep next to the database. Older ones are deleted. */
export const MAX_BACKUPS = 3;

const BACKUP_SUFFIX = '.bak-';
/** The timestamp part of a backup name, as written by backupPath(). */
const BACKUP_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;

export function applyPragmas(sqlite: BetterSqlite3.Database): void {
  // Wait up to 5s for a lock instead of failing right away with SQLITE_BUSY. Set first, since
  // switching to WAL needs a lock too.
  sqlite.pragma('busy_timeout = 5000');
  // WAL lets reads run alongside a write instead of blocking on it, and survives crashes better.
  sqlite.pragma('journal_mode = WAL');
  // In WAL mode NORMAL is still crash-safe for the database file and skips an fsync per commit.
  sqlite.pragma('synchronous = NORMAL');
}

/**
 * True when Drizzle's migrator would apply at least one migration. Mirrors its check: a
 * migration runs when its folderMillis is newer than the last `created_at` it recorded.
 */
export function hasPendingMigrations(
  sqlite: BetterSqlite3.Database,
  migrations: MigrationMeta[],
): boolean {
  if (migrations.length === 0) return false;

  const table = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
    .get();
  if (!table) return true;

  const last = sqlite
    .prepare('SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1')
    .get() as { created_at: number | string } | undefined;
  if (!last) return true;

  const lastMillis = Number(last.created_at);
  return migrations.some((migration) => migration.folderMillis > lastMillis);
}

/** `nubes.db` + 2026-11-23T10:15:30.123Z -> `nubes.db.bak-2026-11-23T10-15-30-123Z`. */
export function backupPath(dbPath: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `${dbPath}${BACKUP_SUFFIX}${stamp}`;
}

/** Backups of `dbPath`, oldest first. The timestamp format sorts lexically. */
export function listBackups(dbPath: string): string[] {
  const dir = path.dirname(dbPath);
  const prefix = `${path.basename(dbPath)}${BACKUP_SUFFIX}`;
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  // Match the exact stamp, so a `-wal` left by opening a backup, or a hand-made
  // `nubes.db.bak-old`, is never listed, pruned or offered as the backup to restore.
  return entries
    .filter((name) => name.startsWith(prefix) && BACKUP_STAMP.test(name.slice(prefix.length)))
    .sort()
    .map((name) => path.join(dir, name));
}

/**
 * Write a consistent snapshot of the open database to `<db>.bak-<timestamp>`.
 *
 * `VACUUM INTO` reads through SQLite, so it includes committed pages still sitting in the
 * `-wal` file. A plain file copy of `nubes.db` would miss them. It is also synchronous,
 * unlike better-sqlite3's `.backup()`, so it fits the synchronous startup path.
 */
export function backupDatabase(sqlite: BetterSqlite3.Database, dbPath: string, now: Date): string {
  const target = backupPath(dbPath, now);
  // Write under a name listBackups() ignores, and rename once complete. A failed VACUUM INTO
  // (corrupt page, full disk) leaves a partial file behind, which must never be offered as the
  // backup to restore or push a good one out of the retention window.
  const staging = path.join(path.dirname(target), `.${path.basename(target)}.tmp`);
  try {
    sqlite.prepare('VACUUM INTO ?').run(staging);
    fs.renameSync(staging, target);
  } catch (error) {
    fs.rmSync(staging, { force: true });
    throw error;
  }
  return target;
}

/**
 * Delete all but the newest `keep` backups. Best effort: a file that can't be removed (locked,
 * read-only) is reported in `failed` and must not stop migrations from running.
 */
export function pruneBackups(
  dbPath: string,
  keep = MAX_BACKUPS,
): { deleted: string[]; failed: Array<{ file: string; error: unknown }> } {
  const backups = listBackups(dbPath);
  const stale = backups.slice(0, Math.max(0, backups.length - keep));
  const deleted: string[] = [];
  const failed: Array<{ file: string; error: unknown }> = [];
  for (const file of stale) {
    try {
      fs.rmSync(file, { force: true });
      deleted.push(file);
    } catch (error) {
      failed.push({ file, error });
    }
  }
  return { deleted, failed };
}

/**
 * SQLITE_CORRUPT (and its extended codes) or SQLITE_NOTADB, which a mangled header gives.
 * Follows `cause`, since Drizzle rethrows SqliteErrors from migrate() as a DrizzleError.
 */
export function isCorruptionError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (
      typeof code === 'string' &&
      (code.startsWith('SQLITE_CORRUPT') || code === 'SQLITE_NOTADB')
    ) {
      return true;
    }
    current = cause;
  }
  return false;
}

export function corruptionMessage(dbPath: string, latestBackup: string | undefined): string {
  const backupLine = latestBackup
    ? `The most recent backup is at:\n${latestBackup}\n\n` +
      'To restore it, quit Nubes, delete the -wal and -shm files next to the database if ' +
      'they exist, and copy the backup over the database file.'
    : 'No backup was found next to it.';
  return `The Nubes database at\n${dbPath}\nis corrupt and can't be opened.\n\n${backupLine}`;
}
