import fs from 'node:fs';
import path from 'node:path';

import type BetterSqlite3 from 'better-sqlite3';
import type { MigrationMeta } from 'drizzle-orm/migrator';

/** How many pre-migration backups to keep next to the database. Older ones are deleted. */
export const MAX_BACKUPS = 3;

const BACKUP_SUFFIX = '.bak-';

export function applyPragmas(sqlite: BetterSqlite3.Database): void {
  // WAL lets reads run alongside a write instead of blocking on it, and survives crashes better.
  sqlite.pragma('journal_mode = WAL');
  // In WAL mode NORMAL is still crash-safe for the database file and skips an fsync per commit.
  sqlite.pragma('synchronous = NORMAL');
  // Wait up to 5s for a lock instead of failing right away with SQLITE_BUSY.
  sqlite.pragma('busy_timeout = 5000');
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
  return entries
    .filter((name) => name.startsWith(prefix))
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
  sqlite.prepare('VACUUM INTO ?').run(target);
  return target;
}

/** Delete all but the newest `keep` backups. Returns the deleted paths. */
export function pruneBackups(dbPath: string, keep = MAX_BACKUPS): string[] {
  const backups = listBackups(dbPath);
  const stale = backups.slice(0, Math.max(0, backups.length - keep));
  for (const file of stale) {
    fs.rmSync(file, { force: true });
  }
  return stale;
}

/** SQLITE_CORRUPT (and its extended codes) or SQLITE_NOTADB, which a mangled header gives. */
export function isCorruptionError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return (
    typeof code === 'string' && (code.startsWith('SQLITE_CORRUPT') || code === 'SQLITE_NOTADB')
  );
}

export function corruptionMessage(dbPath: string, latestBackup: string | undefined): string {
  const backupLine = latestBackup
    ? `The most recent backup is at:\n${latestBackup}\n\n` +
      'To restore it, quit Nubes, delete the -wal and -shm files next to the database if ' +
      'they exist, and copy the backup over the database file.'
    : 'No backup was found next to it.';
  return `The Nubes database at\n${dbPath}\nis corrupt and can't be opened.\n\n${backupLine}`;
}
