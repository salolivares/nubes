import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from '@/common/db/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, '../../common/db/migrations');

export function createTestDb(): {
  db: BetterSQLite3Database<typeof schema>;
  close: () => void;
} {
  const db = drizzle(':memory:', { schema });
  migrate(db, { migrationsFolder });

  return {
    db,
    close: () => {
      // drizzle wraps the underlying better-sqlite3 instance; grab it to close
      (db as unknown as { $client: { close: () => void } }).$client.close();
    },
  };
}
