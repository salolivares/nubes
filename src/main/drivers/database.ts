import path from 'node:path';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { app } from 'electron';
import baseLog from 'electron-log/main';

import * as schema from '@/common/db/schema';

const log = baseLog.scope('Database');

export class Database {
  static #instance: Database;
  public db: BetterSQLite3Database<typeof schema>;

  private constructor() {
    const dbPath = path.join(app.getPath('userData'), 'nubes.db');
    log.info(`Opening database at ${dbPath}`);

    this.db = drizzle(dbPath, { schema });

    const migrationsFolder = app.isPackaged
      ? path.join(process.resourcesPath, 'migrations')
      : path.join(app.getAppPath(), 'src/common/db/migrations');
    log.info(`Running migrations from ${migrationsFolder}`);
    migrate(this.db, { migrationsFolder });
    log.info('Database ready');
  }

  public static get instance(): Database {
    if (!Database.#instance) {
      Database.#instance = new Database();
    }

    return Database.#instance;
  }
}
