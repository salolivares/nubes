import fsp from 'node:fs/promises';
import path from 'node:path';

import { eq, inArray } from 'drizzle-orm';
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
import { mediaAccess } from '@/main/media';
import type { MediaAccess } from '@/main/media/access';
import { assertStoredPaths, deletablePaths } from '@/main/media/guards';

function getDb() {
  return Database.instance.db;
}

/** Collect all file paths (originals + outputs) for a photoset. */
export function getPhotosetFilePaths(db: ReturnType<typeof getDb>, photosetId: number): string[] {
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

/** Reveal only files in the photosets folder, or files main itself exported. */
export function canReveal(access: MediaAccess, filePath: string, exported: Set<string>): boolean {
  return access.isInRoots(filePath) || exported.has(path.resolve(filePath));
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

  handle(PHOTOSET_DELETE, photosetIdArgsSchema, async (_, args) => {
    const db = getDb();
    // Rows written before addImages checked paths could point anywhere. Only unlink photoset files.
    const filePaths = await deletablePaths(mediaAccess, getPhotosetFilePaths(db, args.id));
    await deleteFiles(filePaths);
    db.delete(photosets).where(eq(photosets.id, args.id)).run();
  });

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
    exportedFiles.add(path.resolve(filePath));

    return { filePath };
  });

  handle(PHOTOSET_REMOVE_FILES, photosetRemoveFilesArgsSchema, async (_, args) => {
    await deleteFiles(await deletablePaths(mediaAccess, args.filePaths));
  });

  handle(PHOTOSET_SHOW_IN_FOLDER, photosetShowInFolderArgsSchema, (_, { filePath }) => {
    if (!canReveal(mediaAccess, filePath, exportedFiles)) {
      throw new Error(`Refused to reveal a file outside the allowed folders: ${filePath}`);
    }
    shell.showItemInFolder(filePath);
  });
}
