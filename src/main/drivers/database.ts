import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { app, dialog } from 'electron';
import baseLog from 'electron-log/main';

import { DB_FILENAME, MIGRATIONS_DEV_PATH, MIGRATIONS_FOLDER } from '@/common';
import * as schema from '@/common/db/schema';

import {
  applyPragmas,
  backupDatabase,
  corruptionMessage,
  hasPendingMigrations,
  isCorruptionError,
  listBackups,
  pruneBackups,
} from './database-maintenance';

const log = baseLog.scope('Database');

export class Database {
  static #instance: Database;
  public db: BetterSQLite3Database<typeof schema>;

  private constructor() {
    const dbPath = path.join(app.getPath('userData'), DB_FILENAME);
    log.debug(`Opening database at ${dbPath}`);

    try {
      this.db = Database.open(dbPath);
    } catch (error) {
      if (isCorruptionError(error)) {
        const latestBackup = listBackups(dbPath).at(-1);
        log.error(`Database is corrupt. Latest backup: ${latestBackup ?? 'none'}`, error);
        dialog.showErrorBox('Nubes database is corrupt', corruptionMessage(dbPath, latestBackup));
        app.quit();
      }
      throw error;
    }
    log.info('Database ready');
  }

  private static open(dbPath: string): BetterSQLite3Database<typeof schema> {
    const sqlite = new BetterSqlite3(dbPath);
    applyPragmas(sqlite);
    const db = drizzle(sqlite, { schema });

    const migrationsFolder = app.isPackaged
      ? path.join(process.resourcesPath, MIGRATIONS_FOLDER)
      : path.join(app.getAppPath(), MIGRATIONS_DEV_PATH);
    const migrations = readMigrationFiles({ migrationsFolder });

    if (hasPendingMigrations(sqlite, migrations)) {
      // Drizzle has no down migrations, so a snapshot is the only way back from a bad one.
      // A brand new database has no tables yet and nothing worth keeping.
      const isEmpty = !sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table'").get();
      if (!isEmpty) {
        const backup = backupDatabase(sqlite, dbPath, new Date());
        log.info(`Backed up database to ${backup} before migrating`);
        for (const stale of pruneBackups(dbPath)) {
          log.info(`Deleted old backup ${stale}`);
        }
      }
    }

    // Always hand off to Drizzle, which stays the source of truth for what to apply.
    log.info(`Running migrations from ${migrationsFolder}`);
    // Disable FK enforcement before migrations so table-rebuild migrations
    // (DROP + RENAME) don't trigger ON DELETE CASCADE. The pragma must be
    // set outside the transaction — SQLite ignores it mid-transaction.
    db.run(sql`PRAGMA foreign_keys = OFF`);
    migrate(db, { migrationsFolder });
    db.run(sql`PRAGMA foreign_keys = ON`);
    return db;
  }

  public static get instance(): Database {
    if (!Database.#instance) {
      Database.#instance = new Database();
    }

    return Database.#instance;
  }

  public static init(): void {
    void Database.instance;
  }
}
