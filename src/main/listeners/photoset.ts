import fsp from 'node:fs/promises';
import path from 'node:path';

import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { app, shell } from 'electron';

import {
  PHOTOSET_ADD_IMAGES,
  PHOTOSET_CREATE,
  PHOTOSET_DELETE,
  PHOTOSET_EXPORT_METADATA,
  PHOTOSET_GET,
  PHOTOSET_LIST,
  PHOTOSET_MARK_UPLOADED,
  PHOTOSET_PUBLISH,
  PHOTOSET_REMOVE_FILES,
  PHOTOSET_SHOW_IN_FOLDER,
  PHOTOSET_UPDATE,
} from '@/common/constants';
import { photosetImageOutputs, photosetImages, photosets } from '@/common/db/schema';
import {
  photosetAddImagesArgsSchema,
  photosetCreateArgsSchema,
  photosetIdArgsSchema,
  photosetListArgsSchema,
  photosetRemoveFilesArgsSchema,
  photosetShowInFolderArgsSchema,
  photosetUpdateArgsSchema,
} from '@/common/types';
import { metadataFilename, slugify } from '@/common/utils';
import { Database } from '@/main/drivers/database';
import { handle } from '@/main/ipc';
import { stopPhotosetJobs } from '@/main/listeners/image-processor';
import { mediaAccess } from '@/main/media';
import type { MediaAccess } from '@/main/media/access';
import { isWithin } from '@/main/media/access';
import { assertStoredPaths, deletablePaths } from '@/main/media/guards';
import { photosetOutputFolder, photosetsRoot } from '@/main/photoset-folders';

function getDb() {
  return Database.instance.db;
}

type Db = ReturnType<typeof getDb>;

/** SQLite caps bound parameters per statement, so look paths up in batches. */
const LOOKUP_BATCH = 500;

/** Collect all file paths (originals + outputs) for a photoset. */
export function getPhotosetFilePaths(db: Db, photosetId: number): string[] {
  const images = db
    .select({ originalPath: photosetImages.originalPath })
    .from(photosetImages)
    .where(eq(photosetImages.photosetId, photosetId))
    .all();

  const imageIds =
    images.length > 0
      ? db
          .select({ id: photosetImages.id })
          .from(photosetImages)
          .where(eq(photosetImages.photosetId, photosetId))
          .all()
          .map((r) => r.id)
      : [];

  const outputs =
    imageIds.length > 0
      ? db
          .select({ imagePath: photosetImageOutputs.imagePath })
          .from(photosetImageOutputs)
          .where(inArray(photosetImageOutputs.imageId, imageIds))
          .all()
      : [];

  return [...images.map((r) => r.originalPath), ...outputs.map((r) => r.imagePath)];
}

/** Delete files from disk, ignoring ENOENT for already-missing files. */
export async function deleteFiles(filePaths: string[]): Promise<void> {
  await Promise.all(
    filePaths.map((p) =>
      fsp.unlink(p).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') throw err;
      }),
    ),
  );
}

/** Files main wrote outside the photosets folder this session (metadata exports). */
const exportedFiles = new Set<string>();

/**
 * Reveal only files in the photosets folder, or files main itself exported. Exports match exactly,
 * not after normalizing, so `<dir>/<symlink>/../export.json` can't pass as one.
 */
export function canReveal(access: MediaAccess, filePath: string, exported: Set<string>): boolean {
  return access.isInRoots(filePath) || exported.has(filePath);
}

/**
 * How two paths are compared when deciding whether a file is still in use. macOS and Windows
 * treat `IMG_0001.JPG` and `img_0001.jpg` as the same file, so the comparison ignores case
 * everywhere. On Linux that can only keep a file, never delete one that is in use. ASCII only, to
 * match SQLite's `lower()`.
 */
export function pathKey(filePath: string): string {
  return filePath.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/** `filePaths` with duplicates dropped, comparing by `pathKey()`. Keeps the first spelling. */
function uniqueByKey(filePaths: string[]): string[] {
  return [...new Map(filePaths.map((p) => [pathKey(p), p] as const).reverse()).values()].reverse();
}

/**
 * The `pathKey()`s of the paths in `filePaths` that a photoset other than `exceptPhotosetId`
 * still points at, as an original or an output. With no `exceptPhotosetId`, any photoset counts.
 *
 * Photosets made before per-photoset folders wrote into one shared folder, and two of them can
 * point at the same files. Deleting one must not take the other's images with it.
 */
export function getReferencedPaths(
  db: Db,
  filePaths: string[],
  exceptPhotosetId?: number,
): Set<string> {
  const referenced = new Set<string>();
  const keys = [...new Set(filePaths.map(pathKey))];
  const otherPhotoset =
    exceptPhotosetId === undefined ? undefined : ne(photosetImages.photosetId, exceptPhotosetId);
  for (let i = 0; i < keys.length; i += LOOKUP_BATCH) {
    const batch = keys.slice(i, i + LOOKUP_BATCH);

    for (const { path: p } of db
      .select({ path: photosetImages.originalPath })
      .from(photosetImages)
      .where(and(inArray(sql`lower(${photosetImages.originalPath})`, batch), otherPhotoset))
      .all()) {
      referenced.add(pathKey(p));
    }

    for (const { path: p } of db
      .select({ path: photosetImageOutputs.imagePath })
      .from(photosetImageOutputs)
      .innerJoin(photosetImages, eq(photosetImageOutputs.imageId, photosetImages.id))
      .where(and(inArray(sql`lower(${photosetImageOutputs.imagePath})`, batch), otherPhotoset))
      .all()) {
      referenced.add(pathKey(p));
    }
  }
  return referenced;
}

/** Remove `dir` if it is empty. Leaves it alone if it has files in it or is already gone. */
async function removeDirIfEmpty(dir: string): Promise<void> {
  await fsp.rmdir(dir).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'ENOENT' && err.code !== 'ENOTEMPTY' && err.code !== 'EEXIST') throw err;
  });
}

/** Files directly inside `dir`, or none if it doesn't exist. */
async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => path.join(dir, e.name));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export interface DeletePhotosetDeps {
  db: Db;
  root: string;
  access: MediaAccess;
  /** Resolves once no image job can write to the photoset's folder. */
  stopJobs?: (photosetId: number) => Promise<void>;
}

/**
 * Delete a photoset's row and then its files:
 * - every file its rows point at, unless another photoset points at it too, and
 * - everything else in its own folder (outputs from a re-run that were never saved),
 *   then the folder itself once it's empty.
 *
 * Only images in the photosets folder are unlinked (`deletablePaths()`): old rows can hold source
 * paths. The reference check and the row delete run in one synchronous step, so deletes that run
 * at the same time ("Delete all") each see the others' rows either all there or all gone, and the
 * last one to go deletes the files they shared.
 */
export async function deletePhotoset(
  photosetId: number,
  { db, root, access, stopJobs }: DeletePhotosetDeps,
): Promise<void> {
  await stopJobs?.(photosetId);
  const folder = photosetOutputFolder(root, photosetId);
  const folderFiles = await listFiles(folder);

  // No await from here to the row delete.
  const candidates = uniqueByKey([...getPhotosetFilePaths(db, photosetId), ...folderFiles]);
  const shared = getReferencedPaths(db, candidates, photosetId);
  db.delete(photosets).where(eq(photosets.id, photosetId)).run();

  const unshared = candidates.filter((p) => !shared.has(pathKey(p)));
  await deleteFiles(await deletablePaths(access, unshared));
  await removeDirIfEmpty(folder);
}

/**
 * Delete files the renderer says it no longer needs, such as the outputs of images removed from a
 * draft. Only touches images in the photosets folder that no photoset points at, then removes any
 * per-photoset folder that is left empty.
 */
export async function removeUnreferencedFiles(
  filePaths: string[],
  { db, root, access }: Omit<DeletePhotosetDeps, 'stopJobs'>,
): Promise<void> {
  // Normalize first: the DB holds paths main built with path.join, so `<root>/1/./a.jpg` must
  // match `<root>/1/a.jpg` or the reference check would miss it.
  const deletable = uniqueByKey(
    (await deletablePaths(access, filePaths)).map((p) => path.resolve(p)),
  );
  const referenced = getReferencedPaths(db, deletable);
  const unreferenced = deletable.filter((p) => !referenced.has(pathKey(p)));
  await deleteFiles(unreferenced);

  const folders = new Set(unreferenced.map((p) => path.dirname(p)));
  for (const folder of folders) {
    if (isWithin(root, folder)) await removeDirIfEmpty(folder);
  }
}

export function addPhotosetEventListeners() {
  handle(PHOTOSET_LIST, photosetListArgsSchema, (_, args) => {
    const db = getDb();
    return db.query.photosets.findMany({
      orderBy: (photosets, { asc, desc }) => {
        const col = (args?.sortBy ?? 'createdAt') as keyof typeof photosets;
        const dir = args?.sortOrder === 'asc' ? asc : desc;
        return [dir(photosets[col])];
      },
      where: args?.status ? eq(photosets.status, args.status) : undefined,
      with: {
        images: {
          columns: { id: true },
        },
      },
    });
  });

  handle(PHOTOSET_GET, photosetIdArgsSchema, (_, args) => {
    const db = getDb();
    return db.query.photosets.findFirst({
      where: eq(photosets.id, args.id),
      with: {
        images: {
          with: {
            outputs: true,
          },
        },
      },
    });
  });

  handle(PHOTOSET_CREATE, photosetCreateArgsSchema, (_, args) => {
    const db = getDb();
    const rows = db.insert(photosets).values(args).returning().all();
    return rows[0];
  });

  handle(PHOTOSET_UPDATE, photosetUpdateArgsSchema, (_, args) => {
    const db = getDb();
    const { id, ...data } = args;
    const rows = db
      .update(photosets)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(photosets.id, id))
      .returning()
      .all();
    return rows[0];
  });

  handle(PHOTOSET_DELETE, photosetIdArgsSchema, (_, args) =>
    deletePhotoset(args.id, {
      db: getDb(),
      root: photosetsRoot(),
      access: mediaAccess,
      stopJobs: stopPhotosetJobs,
    }),
  );

  handle(PHOTOSET_ADD_IMAGES, photosetAddImagesArgsSchema, (_, args) => {
    assertStoredPaths(mediaAccess, args.images);
    const db = getDb();
    return db.transaction((tx) => {
      const insertedImages = [];

      // Replace existing images so repeated saves are idempotent for a photoset.
      tx.delete(photosetImages).where(eq(photosetImages.photosetId, args.photosetId)).run();

      for (const image of args.images) {
        const { outputs, ...imageData } = image;
        const rows = tx
          .insert(photosetImages)
          .values({ ...imageData, photosetId: args.photosetId, sortOrder: image.sortOrder ?? 0 })
          .returning()
          .all();
        const row = rows[0];

        if (outputs.length > 0) {
          tx.insert(photosetImageOutputs)
            .values(outputs.map((o) => ({ ...o, imageId: row.id })))
            .run();
        }

        insertedImages.push(row);
      }

      tx.update(photosets)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(photosets.id, args.photosetId))
        .run();

      return insertedImages;
    });
  });

  handle(PHOTOSET_PUBLISH, photosetIdArgsSchema, (_, args) => {
    const db = getDb();
    const now = new Date().toISOString();
    const rows = db
      .update(photosets)
      .set({ status: 'published', publishedAt: now, updatedAt: now })
      .where(eq(photosets.id, args.id))
      .returning()
      .all();
    return rows[0];
  });

  handle(PHOTOSET_MARK_UPLOADED, photosetIdArgsSchema, (_, args) => {
    const db = getDb();
    const now = new Date().toISOString();
    const rows = db
      .update(photosets)
      .set({ uploadedAt: now, updatedAt: now })
      .where(eq(photosets.id, args.id))
      .returning()
      .all();
    return rows[0];
  });

  handle(PHOTOSET_EXPORT_METADATA, photosetIdArgsSchema, async (_, args) => {
    const db = getDb();
    const photoset = await db.query.photosets.findFirst({
      where: eq(photosets.id, args.id),
      with: {
        images: {
          columns: { name: true, camera: true },
        },
      },
    });

    if (!photoset) throw new Error(`Photoset ${args.id} not found`);

    const metadata = {
      title: photoset.name,
      location: photoset.location,
      year: photoset.year,
      published: photoset.status === 'published',
      images: photoset.images.map((img) => ({
        id: slugify(img.name),
        name: img.name,
        camera: img.camera,
      })),
    };

    const filename = metadataFilename(photoset.year, photoset.name);
    const filePath = path.join(app.getPath('downloads'), filename);
    await fsp.writeFile(filePath, JSON.stringify(metadata, null, 2), 'utf-8');
    exportedFiles.add(filePath);

    return { filePath };
  });

  handle(PHOTOSET_REMOVE_FILES, photosetRemoveFilesArgsSchema, (_, args) =>
    removeUnreferencedFiles(args.filePaths, {
      db: getDb(),
      root: photosetsRoot(),
      access: mediaAccess,
    }),
  );

  handle(PHOTOSET_SHOW_IN_FOLDER, photosetShowInFolderArgsSchema, (_, { filePath }) => {
    if (!canReveal(mediaAccess, filePath, exportedFiles)) {
      throw new Error(`Refused to reveal a file outside the allowed folders: ${filePath}`);
    }
    shell.showItemInFolder(filePath);
  });
}
