/**
 * Writes tests/e2e/fixtures/nubes-0000.db: a database as it looked after migration 0000, with
 * a few photosets in it. The e2e launch test copies it into a fresh userData folder so the app
 * has to migrate real old data forward on boot.
 *
 * The committed file is the fixture. Rerun this only to change the seed rows, and only while
 * migration 0000 is unchanged:
 *
 *   node scripts/create-e2e-fixture-db.ts
 *
 * Uses Node's built-in `node:sqlite`, because better-sqlite3 is built for Electron's ABI.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const projectDir = path.resolve(import.meta.dirname, '..');
const migrationsDir = path.join(projectDir, 'src/common/db/migrations');
const outPath = path.join(projectDir, 'tests/e2e/fixtures/nubes-0000.db');

const journal = JSON.parse(fs.readFileSync(path.join(migrationsDir, 'meta/_journal.json'), 'utf8'));
const first = journal.entries[0] as { tag: string; when: number };
if (!first.tag.startsWith('0000_')) throw new Error(`Unexpected first migration ${first.tag}`);
const migrationSql = fs.readFileSync(path.join(migrationsDir, `${first.tag}.sql`), 'utf8');

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.rmSync(outPath, { force: true });
const db = new DatabaseSync(outPath);

// Apply 0000 and record it the way drizzle's migrator does, so the app runs 0001 onward.
for (const statement of migrationSql.split('--> statement-breakpoint')) {
  db.exec(statement);
}
db.exec(`
  CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at numeric
  )
`);
db.prepare('INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)').run(
  crypto.createHash('sha256').update(migrationSql).digest('hex'),
  first.when,
);

const insertPhotoset = db.prepare(`
  INSERT INTO photosets
    (id, name, location, year, camera, bucket_name, status, created_at, updated_at, published_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertImage = db.prepare(`
  INSERT INTO photoset_images
    (id, photoset_id, name, camera, original_path, preview, sort_order, created_at)
  VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
`);
const insertOutput = db.prepare(`
  INSERT INTO photoset_image_outputs (image_id, image_path, type, resolution, byte_length)
  VALUES (?, ?, ?, ?, ?)
`);

// A published photoset with every column filled in, including the `camera` column 0001 drops.
insertPhotoset.run(
  1,
  'Fixture Joshua Tree',
  'Joshua Tree, CA',
  2024,
  'Fujifilm X100V',
  'mock-photos-bucket',
  'published',
  '2024-03-02T18:00:00.000Z',
  '2024-03-03T18:00:00.000Z',
  '2024-03-03T18:00:00.000Z',
);
// A draft with NULL location and year. Migrations 0002 and 0003 make both NOT NULL and have to
// fill them in, and their table rebuilds must not cascade-delete this photoset's images.
insertPhotoset.run(
  2,
  'Fixture Untitled Roll',
  null,
  null,
  null,
  'mock-photos-bucket',
  'draft',
  '2024-05-10T12:00:00.000Z',
  '2024-05-10T12:00:00.000Z',
  null,
);

const images = [
  { id: 1, photosetId: 1, name: 'DSCF0001.jpg', sortOrder: 0 },
  { id: 2, photosetId: 1, name: 'DSCF0002.jpg', sortOrder: 1 },
  { id: 3, photosetId: 2, name: 'IMG_0001.jpg', sortOrder: 0 },
];
for (const image of images) {
  insertImage.run(
    image.id,
    image.photosetId,
    image.name,
    'Fujifilm X100V',
    `/fixture/originals/${image.name}`,
    image.sortOrder,
    '2024-03-02T18:00:00.000Z',
  );
  for (const resolution of [128, 640, 1280, 2880]) {
    for (const type of ['jpg', 'webp']) {
      const base = image.name.replace(/\.jpg$/, '');
      insertOutput.run(
        image.id,
        `/fixture/photosets/${image.photosetId}/${base}-${resolution}.${type}`,
        type,
        resolution,
        resolution * 100,
      );
    }
  }
}

db.exec('VACUUM');
db.close();
console.log(`Wrote ${path.relative(projectDir, outPath)}`);
