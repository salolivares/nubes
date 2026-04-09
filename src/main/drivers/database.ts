import path from 'node:path';

import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { app } from 'electron';
import baseLog from 'electron-log/main';

import { DB_FILENAME, MIGRATIONS_DEV_PATH, MIGRATIONS_FOLDER } from '@/common';
import * as schema from '@/common/db/schema';

const log = baseLog.scope('Database');

export class Database {
  static #instance: Database;
  public db: BetterSQLite3Database<typeof schema>;

  private constructor() {
    const dbPath = path.join(app.getPath('userData'), DB_FILENAME);
    log.debug(`Opening database at ${dbPath}`);

    this.db = drizzle(dbPath, { schema });

    const migrationsFolder = app.isPackaged
      ? path.join(process.resourcesPath, MIGRATIONS_FOLDER)
      : path.join(app.getAppPath(), MIGRATIONS_DEV_PATH);
    log.info(`Running migrations from ${migrationsFolder}`);
    // Disable FK enforcement before migrations so table-rebuild migrations
    // (DROP + RENAME) don't trigger ON DELETE CASCADE. The pragma must be
    // set outside the transaction — SQLite ignores it mid-transaction.
    this.db.run(sql`PRAGMA foreign_keys = OFF`);
    migrate(this.db, { migrationsFolder });
    this.db.run(sql`PRAGMA foreign_keys = ON`);
    log.info('Database ready');
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
