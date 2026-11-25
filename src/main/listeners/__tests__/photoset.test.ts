import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as schema from '@/common/db/schema';
import { photosetImageOutputs, photosetImages, photosets } from '@/common/db/schema';
import { createTestDb } from '@/main/__test-utils__/db';
import { processImage } from '@/main/drivers/image-worker/process-image';
import {
  deleteFiles,
  deletePhotoset,
  getPhotosetFilePaths,
  getReferencedPaths,
  removeUnreferencedFiles,
} from '@/main/listeners/photoset';
import { MediaAccess } from '@/main/media/access';
import { photosetOutputFolder } from '@/main/photoset-folders';

// Real sharp can't run here: under Electron's Node on Linux, libvips clashes with Electron's own
// GLib and the test worker hangs (it did on CI). The fake writes each output as the input bytes
// plus its file name, which is all these tests need from processImage.
vi.mock('sharp', () => ({
  default: (input: Buffer) => {
    const image = {
      metadata: async () => ({ format: 'jpeg', width: 64, height: 48 }),
      resize: () => image,
      toFormat: () => image,
      toFile: async (filePath: string) => {
        fs.writeFileSync(filePath, Buffer.concat([input, Buffer.from(filePath)]));
        return {};
      },
    };
    return image;
  },
}));

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
    .values({
      name: 'Test Set',
      location: 'Test Location',
      year: 2026,
      bucketName: 'test-bucket',
      ...overrides,
    })
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
    outputs?: Array<{
      imagePath: string;
      type: 'jpg' | 'webp';
      resolution: number;
      byteLength: number;
    }>;
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
        outputs: [{ imagePath: '/tmp/p_640.jpg', type: 'jpg', resolution: 640, byteLength: 1000 }],
      },
    ]);

    db.delete(photosets).where(eq(photosets.id, ps.id)).run();

    const images = db
      .select()
      .from(photosetImages)
      .where(eq(photosetImages.photosetId, ps.id))
      .all();
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

    const outputs = db
      .select()
      .from(photosetImageOutputs)
      .where(eq(photosetImageOutputs.imageId, inserted[0].id))
      .all();
    expect(outputs).toHaveLength(2);
  });

  it('replaces existing images on re-add (idempotent)', () => {
    const ps = createPhotoset();

    addImages(ps.id, [{ name: 'v1.jpg', originalPath: '/v1.jpg', outputs: [] }]);

    addImages(ps.id, [
      { name: 'v2.jpg', originalPath: '/v2.jpg', outputs: [] },
      { name: 'v3.jpg', originalPath: '/v3.jpg', outputs: [] },
    ]);

    const images = db
      .select()
      .from(photosetImages)
      .where(eq(photosetImages.photosetId, ps.id))
      .all();
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
        outputs: [{ imagePath: outPath, type: 'jpg', resolution: 640, byteLength: 50 }],
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
    addImages(ps1.id, [{ name: 'a.jpg', originalPath: file1, outputs: [] }]);

    const ps2 = createPhotoset({ name: 'Set 2' });
    addImages(ps2.id, [{ name: 'b.jpg', originalPath: file2, outputs: [] }]);

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

describe('photosets made from same-named sources', () => {
  let tmpDir: string;
  let root: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nubes-test-'));
    root = path.join(tmpDir, 'photosets');
  });

  const deps = () => ({ db, root, access: new MediaAccess(() => [root]) });

  /** An image file directly in the photosets folder, as photosets made before #131 had. */
  function legacyFile(name: string): string {
    fs.mkdirSync(root, { recursive: true });
    const filePath = path.join(root, name);
    fs.writeFileSync(filePath, 'x');
    return filePath;
  }

  const output = (imagePath: string) => ({
    imagePath,
    type: 'jpg' as const,
    resolution: 640,
    byteLength: 1,
  });

  afterEach(() => fsp.rm(tmpDir, { recursive: true, force: true }));

  /** Write a stand-in source image at `<tmpDir>/<folder>/<name>`, like a camera card would. */
  function source(folder: string, name: string, shade: number): string {
    const filePath = path.join(tmpDir, folder, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from([shade]));
    return filePath;
  }

  /** Process `sources` the way the worker does, then save them the way the wizard does. */
  async function processInto(photosetId: number, sources: string[]) {
    const folder = photosetOutputFolder(root, photosetId);
    const processed = [];
    for (const src of sources) processed.push(await processImage(src, folder));
    addImages(
      photosetId,
      processed.map((img) => ({
        name: img.name,
        originalPath: img.imagePaths[0].imagePath,
        outputs: img.imagePaths,
      })),
    );
    return processed.flatMap((img) => img.imagePaths.map((p) => p.imagePath));
  }

  it('writes each photoset to its own folder, and deleting one keeps the other', async () => {
    const trip1 = createPhotoset({ name: 'Trip 1' });
    const trip2 = createPhotoset({ name: 'Trip 2' });

    const trip1Files = await processInto(trip1.id, [
      source('card-a', 'IMG_0001.jpg', 10),
      source('card-a', 'IMG_0002.jpg', 20),
      source('card-a', 'IMG_0003.jpg', 30),
    ]);
    const trip2Files = await processInto(trip2.id, [
      source('card-b', 'IMG_0001.jpg', 200),
      source('card-b', 'IMG_0002.jpg', 210),
    ]);

    expect(trip1Files).toHaveLength(24);
    expect(trip2Files).toHaveLength(16);
    expect(trip1Files.filter((p) => trip2Files.includes(p))).toEqual([]);
    expect(trip1Files.every((p) => path.dirname(p) === path.join(root, String(trip1.id)))).toBe(
      true,
    );

    await deletePhotoset(trip2.id, deps());

    expect(trip1Files.every((p) => fs.existsSync(p))).toBe(true);
    expect(trip2Files.some((p) => fs.existsSync(p))).toBe(false);
    expect(fs.existsSync(photosetOutputFolder(root, trip2.id))).toBe(false);
    expect(getPhotosetFilePaths(db, trip1.id)).toHaveLength(24 + 3);
  });

  it('gives same-named sources in one photoset their own files', async () => {
    const ps = createPhotoset();
    const files = await processInto(ps.id, [
      source('card-a', 'IMG_0001.jpg', 10),
      source('card-b', 'IMG_0001.jpg', 200),
    ]);

    expect(new Set(files).size).toBe(16);
    expect(files.map((p) => path.basename(p))).toContain('IMG_0001_128.jpg');
    expect(files.map((p) => path.basename(p))).toContain('IMG_0001-2_128.jpg');
  });

  it('keeps files from a re-run apart, and delete clears the leftovers with the folder', async () => {
    const ps = createPhotoset();
    const src = source('card-a', 'IMG_0001.jpg', 10);
    const firstRun = await processInto(ps.id, [src]);
    // A second run replaces the rows, so the first run's files are now on disk but unreferenced.
    const secondRun = await processInto(ps.id, [src]);

    expect(firstRun.filter((p) => secondRun.includes(p))).toEqual([]);

    await deletePhotoset(ps.id, deps());

    expect([...firstRun, ...secondRun].some((p) => fs.existsSync(p))).toBe(false);
    expect(fs.existsSync(photosetOutputFolder(root, ps.id))).toBe(false);
  });

  it('does not delete legacy flat files that another photoset still points at', async () => {
    // Before per-photoset folders, two photosets could point at the same flat files.
    const shared = legacyFile('IMG_0001_640.jpg');
    const ownOnly = legacyFile('IMG_0002_640.jpg');

    const older = createPhotoset({ name: 'Older' });
    addImages(older.id, [{ name: 'IMG_0001', originalPath: shared, outputs: [output(shared)] }]);
    const newer = createPhotoset({ name: 'Newer' });
    addImages(newer.id, [
      { name: 'IMG_0001', originalPath: shared, outputs: [output(shared)] },
      { name: 'IMG_0002', originalPath: ownOnly, outputs: [output(ownOnly)] },
    ]);

    await deletePhotoset(newer.id, deps());

    expect(fs.existsSync(shared)).toBe(true);
    expect(fs.existsSync(ownOnly)).toBe(false);
    expect(fs.existsSync(root)).toBe(true);
  });

  it('removeFiles skips files a photoset still points at and drops the empty folder', async () => {
    const ps = createPhotoset();
    const files = await processInto(ps.id, [source('card-a', 'IMG_0001.jpg', 10)]);
    const outside = path.join(tmpDir, 'outside.jpg');
    fs.writeFileSync(outside, 'x');

    // Still in the DB: nothing is deleted.
    await removeUnreferencedFiles([...files, outside], deps());
    expect(files.every((p) => fs.existsSync(p))).toBe(true);
    expect(fs.existsSync(outside)).toBe(true);

    // The draft was saved without the image, so its files can go, and the folder with them.
    addImages(ps.id, []);
    await removeUnreferencedFiles([...files, outside], deps());
    expect(files.some((p) => fs.existsSync(p))).toBe(false);
    expect(fs.existsSync(photosetOutputFolder(root, ps.id))).toBe(false);
    expect(fs.existsSync(outside)).toBe(true);
  });

  it('deletes shared legacy files when every photoset using them is deleted at once', async () => {
    const shared = legacyFile('IMG_0001_640.jpg');
    const ids = [createPhotoset({ name: 'A' }).id, createPhotoset({ name: 'B' }).id];
    for (const id of ids) {
      addImages(id, [{ name: 'IMG_0001', originalPath: shared, outputs: [output(shared)] }]);
    }

    // Like "Delete all" in storage settings: every delete in flight together.
    await Promise.all(ids.map((id) => deletePhotoset(id, deps())));

    expect(fs.existsSync(shared)).toBe(false);
    expect(db.select().from(photosets).all()).toEqual([]);
  });

  it('treats paths that differ only in case as the same file', async () => {
    const upper = legacyFile('IMG_0001_640.jpg');
    const lower = path.join(root, 'img_0001_640.jpg');
    const older = createPhotoset({ name: 'Older' });
    addImages(older.id, [{ name: 'IMG_0001', originalPath: upper, outputs: [output(upper)] }]);
    const newer = createPhotoset({ name: 'Newer' });
    addImages(newer.id, [{ name: 'img_0001', originalPath: lower, outputs: [output(lower)] }]);

    expect(getReferencedPaths(db, [lower], newer.id).size).toBe(1);

    // On macOS and Windows `lower` is the same file as `upper`. Deleting must not unlink it.
    await deletePhotoset(newer.id, deps());
    expect(fs.existsSync(upper)).toBe(true);

    await removeUnreferencedFiles([lower, upper.replace('IMG', 'Img')], deps());
    expect(fs.existsSync(upper)).toBe(true);
  });

  it('removeFiles normalizes paths before checking whether they are in use', async () => {
    const ps = createPhotoset();
    const [file] = await processInto(ps.id, [source('card-a', 'IMG_0001.jpg', 10)]);
    // Not path.join: it would normalize the `.` away.
    const sneaky = [path.dirname(file), '.', path.basename(file)].join(path.sep);

    await removeUnreferencedFiles([sneaky], deps());

    expect(fs.existsSync(file)).toBe(true);
  });

  it('looks up more paths than fit in one SQLite batch', () => {
    const ps = createPhotoset();
    const paths = Array.from({ length: 1201 }, (_, i) => path.join(root, `IMG_${i}_640.jpg`));
    addImages(ps.id, [{ name: 'many', originalPath: paths[0], outputs: paths.map(output) }]);

    expect(getReferencedPaths(db, paths).size).toBe(1201);
    expect(getReferencedPaths(db, paths, ps.id).size).toBe(0);
  });

  it("stops the photoset's image jobs before it touches the row or the files", async () => {
    const ps = createPhotoset();
    const files = await processInto(ps.id, [source('card-a', 'IMG_0001.jpg', 10)]);
    const stopJobs = vi.fn(async (id: number) => {
      expect(id).toBe(ps.id);
      expect(db.select().from(photosets).where(eq(photosets.id, ps.id)).get()).toBeDefined();
      expect(files.every((p) => fs.existsSync(p))).toBe(true);
    });

    await deletePhotoset(ps.id, { ...deps(), stopJobs });

    expect(stopJobs).toHaveBeenCalledOnce();
    expect(files.some((p) => fs.existsSync(p))).toBe(false);
  });

  it("never unlinks an old row's source path outside the photosets folder", async () => {
    const original = path.join(tmpDir, 'card-a', 'DSCF0001.jpg');
    fs.mkdirSync(path.dirname(original), { recursive: true });
    fs.writeFileSync(original, 'x');
    const out = legacyFile('DSCF0001_640.jpg');
    const ps = createPhotoset();
    addImages(ps.id, [{ name: 'DSCF0001', originalPath: original, outputs: [output(out)] }]);

    await deletePhotoset(ps.id, deps());

    expect(fs.existsSync(original)).toBe(true);
    expect(fs.existsSync(out)).toBe(false);
  });
});
