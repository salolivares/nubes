import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type * as schema from '@/common/db/schema';
import { photosetImageOutputs, photosetImages, photosets } from '@/common/db/schema';
import { createTestDb } from '@/main/__test-utils__/db';
import { deleteFiles, getPhotosetFilePaths } from '@/main/listeners/photoset';

let db: BetterSQLite3Database<typeof schema>;
let close: () => void;

beforeAll(() => {
  ({ db, close } = createTestDb());
});

afterAll(() => close());

beforeEach(() => {
  // Clean all tables between tests
  db.delete(photosetImageOutputs).run();
  db.delete(photosetImages).run();
  db.delete(photosets).run();
});

// ── Helpers ────────────────────────────────────────────────────────────

function createPhotoset(overrides: Partial<typeof photosets.$inferInsert> = {}) {
  const rows = db
    .insert(photosets)
    .values({ name: 'Test Set', bucketName: 'test-bucket', ...overrides })
    .returning()
    .all();
  return rows[0];
}

function addImages(
  photosetId: number,
  images: Array<{
    name: string;
    originalPath: string;
    camera?: string;
    outputs?: Array<{ imagePath: string; type: 'jpg' | 'webp'; resolution: number; byteLength: number }>;
  }>,
) {
  return db.transaction((tx) => {
    const insertedImages = [];

    tx.delete(photosetImages).where(eq(photosetImages.photosetId, photosetId)).run();

    for (const image of images) {
      const { outputs, ...imageData } = image;
      const rows = tx
        .insert(photosetImages)
        .values({ ...imageData, photosetId, sortOrder: 0 })
        .returning()
        .all();
      const row = rows[0];

      if (outputs && outputs.length > 0) {
        tx.insert(photosetImageOutputs)
          .values(outputs.map((o) => ({ ...o, imageId: row.id })))
          .run();
      }

      insertedImages.push(row);
    }

    tx.update(photosets)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(photosets.id, photosetId))
      .run();

    return insertedImages;
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('photoset CRUD', () => {
  it('creates a photoset with id and timestamps', () => {
    const ps = createPhotoset();
    expect(ps.id).toBeTypeOf('number');
    expect(ps.name).toBe('Test Set');
    expect(ps.status).toBe('draft');
    expect(ps.createdAt).toBeTruthy();
    expect(ps.updatedAt).toBeTruthy();
    expect(ps.publishedAt).toBeNull();
  });

  it('lists photosets sorted by createdAt desc', async () => {
    createPhotoset({ name: 'First' });
    createPhotoset({ name: 'Second' });

    const results = await db.query.photosets.findMany({
      orderBy: (ps, { desc }) => [desc(ps.createdAt)],
    });

    expect(results).toHaveLength(2);
    const names = results.map((r) => r.name);
    expect(names).toContain('First');
    expect(names).toContain('Second');
  });

  it('lists photosets sorted by name asc', async () => {
    createPhotoset({ name: 'Bravo' });
    createPhotoset({ name: 'Alpha' });
    createPhotoset({ name: 'Charlie' });

    const results = await db.query.photosets.findMany({
      orderBy: (ps, { asc }) => [asc(ps.name)],
    });

    expect(results.map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('filters by status', async () => {
    createPhotoset({ name: 'Draft' });
    const pub = createPhotoset({ name: 'Published' });
    db.update(photosets)
      .set({ status: 'published', publishedAt: new Date().toISOString() })
      .where(eq(photosets.id, pub.id))
      .run();

    const drafts = await db.query.photosets.findMany({
      where: eq(photosets.status, 'draft'),
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].name).toBe('Draft');
  });

  it('gets a photoset by id with nested images and outputs', async () => {
    const ps = createPhotoset();
    addImages(ps.id, [
      {
        name: 'sunset.jpg',
        originalPath: '/photos/sunset.jpg',
        outputs: [
          { imagePath: '/tmp/sunset_640.jpg', type: 'jpg', resolution: 640, byteLength: 5000 },
          { imagePath: '/tmp/sunset_640.webp', type: 'webp', resolution: 640, byteLength: 3000 },
        ],
      },
    ]);

    const result = await db.query.photosets.findFirst({
      where: eq(photosets.id, ps.id),
      with: { images: { with: { outputs: true } } },
    });

    expect(result).toBeDefined();
    expect(result!.images).toHaveLength(1);
    expect(result!.images[0].outputs).toHaveLength(2);
    expect(result!.images[0].outputs[0].type).toBe('jpg');
  });

  it('updates a photoset and changes updatedAt', () => {
    const ps = createPhotoset();
    const originalUpdatedAt = ps.updatedAt;

    // Small delay to ensure timestamp differs
    const now = new Date(Date.now() + 1000).toISOString();
    const rows = db
      .update(photosets)
      .set({ name: 'Renamed', updatedAt: now })
      .where(eq(photosets.id, ps.id))
      .returning()
      .all();

    expect(rows[0].name).toBe('Renamed');
    expect(rows[0].updatedAt).not.toBe(originalUpdatedAt);
  });

  it('deletes a photoset and cascades to images and outputs', () => {
    const ps = createPhotoset();
    addImages(ps.id, [
      {
        name: 'photo.jpg',
        originalPath: '/p.jpg',
        outputs: [
          { imagePath: '/tmp/p_640.jpg', type: 'jpg', resolution: 640, byteLength: 1000 },
        ],
      },
    ]);

    db.delete(photosets).where(eq(photosets.id, ps.id)).run();

    const images = db.select().from(photosetImages).where(eq(photosetImages.photosetId, ps.id)).all();
    const outputs = db.select().from(photosetImageOutputs).all();
    expect(images).toHaveLength(0);
    expect(outputs).toHaveLength(0);
  });
});

describe('addImages', () => {
  it('inserts images with outputs in a transaction', () => {
    const ps = createPhotoset();
    const inserted = addImages(ps.id, [
      {
        name: 'a.jpg',
        originalPath: '/a.jpg',
        camera: 'Sony A7',
        outputs: [
          { imagePath: '/tmp/a_640.jpg', type: 'jpg', resolution: 640, byteLength: 5000 },
          { imagePath: '/tmp/a_1280.jpg', type: 'jpg', resolution: 1280, byteLength: 10000 },
        ],
      },
      {
        name: 'b.jpg',
        originalPath: '/b.jpg',
        outputs: [],
      },
    ]);

    expect(inserted).toHaveLength(2);
    expect(inserted[0].camera).toBe('Sony A7');

    const outputs = db.select().from(photosetImageOutputs).where(eq(photosetImageOutputs.imageId, inserted[0].id)).all();
    expect(outputs).toHaveLength(2);
  });

  it('replaces existing images on re-add (idempotent)', () => {
    const ps = createPhotoset();

    addImages(ps.id, [
      { name: 'v1.jpg', originalPath: '/v1.jpg', outputs: [] },
    ]);

    addImages(ps.id, [
      { name: 'v2.jpg', originalPath: '/v2.jpg', outputs: [] },
      { name: 'v3.jpg', originalPath: '/v3.jpg', outputs: [] },
    ]);

    const images = db.select().from(photosetImages).where(eq(photosetImages.photosetId, ps.id)).all();
    expect(images).toHaveLength(2);
    expect(images.map((i) => i.name).sort()).toEqual(['v2.jpg', 'v3.jpg']);
  });
});

describe('publish and markUploaded', () => {
  it('publish sets status, publishedAt, and updatedAt', () => {
    const ps = createPhotoset();
    const now = new Date().toISOString();

    const rows = db
      .update(photosets)
      .set({ status: 'published', publishedAt: now, updatedAt: now })
      .where(eq(photosets.id, ps.id))
      .returning()
      .all();

    expect(rows[0].status).toBe('published');
    expect(rows[0].publishedAt).toBeTruthy();
  });

  it('markUploaded sets uploadedAt and updatedAt', () => {
    const ps = createPhotoset();
    const now = new Date().toISOString();

    const rows = db
      .update(photosets)
      .set({ uploadedAt: now, updatedAt: now })
      .where(eq(photosets.id, ps.id))
      .returning()
      .all();

    expect(rows[0].uploadedAt).toBeTruthy();
  });
});

describe('delete cleans up files', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nubes-test-'));
  });

  function createTempFile(name: string, size: number): string {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, Buffer.alloc(size, 'x'));
    return filePath;
  }

  it('collects original + output paths for a photoset', () => {
    const origPath = createTempFile('orig.jpg', 100);
    const outPath = createTempFile('out_640.jpg', 50);

    const ps = createPhotoset();
    addImages(ps.id, [
      {
        name: 'photo.jpg',
        originalPath: origPath,
        outputs: [
          { imagePath: outPath, type: 'jpg', resolution: 640, byteLength: 50 },
        ],
      },
    ]);

    const paths = getPhotosetFilePaths(db, ps.id);
    expect(paths).toContain(origPath);
    expect(paths).toContain(outPath);
    expect(paths).toHaveLength(2);
  });

  it('deletes image files from disk', async () => {
    const origPath = createTempFile('orig.jpg', 100);
    const outPath = createTempFile('out_640.jpg', 50);

    expect(fs.existsSync(origPath)).toBe(true);
    expect(fs.existsSync(outPath)).toBe(true);

    await deleteFiles([origPath, outPath]);

    expect(fs.existsSync(origPath)).toBe(false);
    expect(fs.existsSync(outPath)).toBe(false);
  });

  it('ignores missing files gracefully', async () => {
    const missingPath = path.join(tmpDir, 'does-not-exist.jpg');
    await expect(deleteFiles([missingPath])).resolves.toBeUndefined();
  });

  it('only deletes files for the targeted photoset', async () => {
    const file1 = createTempFile('ps1_orig.jpg', 100);
    const file2 = createTempFile('ps2_orig.jpg', 100);

    const ps1 = createPhotoset({ name: 'Set 1' });
    addImages(ps1.id, [
      { name: 'a.jpg', originalPath: file1, outputs: [] },
    ]);

    const ps2 = createPhotoset({ name: 'Set 2' });
    addImages(ps2.id, [
      { name: 'b.jpg', originalPath: file2, outputs: [] },
    ]);

    // Delete only ps1's files
    const paths = getPhotosetFilePaths(db, ps1.id);
    await deleteFiles(paths);
    db.delete(photosets).where(eq(photosets.id, ps1.id)).run();

    expect(fs.existsSync(file1)).toBe(false);
    expect(fs.existsSync(file2)).toBe(true);

    // Cleanup
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });
});
