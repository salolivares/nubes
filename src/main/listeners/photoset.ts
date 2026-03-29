import { eq } from 'drizzle-orm';

import {
  PHOTOSET_ADD_IMAGES,
  PHOTOSET_CREATE,
  PHOTOSET_DELETE,
  PHOTOSET_GET,
  PHOTOSET_LIST,
  PHOTOSET_MARK_UPLOADED,
  PHOTOSET_PUBLISH,
  PHOTOSET_UPDATE,
} from '@/common/constants';
import { photosetImageOutputs, photosetImages, photosets } from '@/common/db/schema';
import {
  photosetAddImagesArgsSchema,
  photosetCreateArgsSchema,
  photosetIdArgsSchema,
  photosetListArgsSchema,
  photosetUpdateArgsSchema,
} from '@/common/types';
import { Database } from '@/main/drivers/database';
import { handle } from '@/main/ipc';

function getDb() {
  return Database.instance.db;
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

  handle(PHOTOSET_DELETE, photosetIdArgsSchema, (_, args) => {
    const db = getDb();
    db.delete(photosets).where(eq(photosets.id, args.id)).run();
  });

  handle(PHOTOSET_ADD_IMAGES, photosetAddImagesArgsSchema, (_, args) => {
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
}
