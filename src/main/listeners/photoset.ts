import { eq } from 'drizzle-orm';
import { ipcMain } from 'electron';
import { z } from 'zod';

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
import { outputImageSchema } from '@/common/types';
import { Database } from '@/main/drivers/database';

const photosetStatusSchema = z.union([z.literal('draft'), z.literal('published')]);

const idArgsSchema = z.object({ id: z.number() });

const listArgsSchema = z
  .object({
    sortBy: z.string().optional(),
    sortOrder: z.string().optional(),
    status: photosetStatusSchema.optional(),
  })
  .optional();

const createArgsSchema = z.object({
  name: z.string(),
  bucketName: z.string(),
  location: z.string().optional(),
  year: z.number().optional(),
});

const updateArgsSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  location: z.string().optional(),
  year: z.number().optional(),
  status: photosetStatusSchema.optional(),
});

const addImagesArgsSchema = z.object({
  photosetId: z.number(),
  images: z.array(
    z.object({
      name: z.string(),
      camera: z.string().optional(),
      originalPath: z.string(),
      preview: z.string().optional(),
      sortOrder: z.number().optional(),
      outputs: z.array(outputImageSchema),
    })
  ),
});

function getDb() {
  return Database.instance.db;
}

export function addPhotosetEventListeners() {
  ipcMain.handle(PHOTOSET_LIST, (_, rawArgs) => {
    const args = listArgsSchema.parse(rawArgs);
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

  ipcMain.handle(PHOTOSET_GET, (_, rawArgs) => {
    const args = idArgsSchema.parse(rawArgs);
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

  ipcMain.handle(PHOTOSET_CREATE, (_, rawArgs) => {
    const args = createArgsSchema.parse(rawArgs);
    const db = getDb();
    const rows = db.insert(photosets).values(args).returning().all();
    return rows[0];
  });

  ipcMain.handle(PHOTOSET_UPDATE, (_, rawArgs) => {
    const args = updateArgsSchema.parse(rawArgs);
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

  ipcMain.handle(PHOTOSET_DELETE, (_, rawArgs) => {
    const args = idArgsSchema.parse(rawArgs);
    const db = getDb();
    db.delete(photosets).where(eq(photosets.id, args.id)).run();
  });

  ipcMain.handle(PHOTOSET_ADD_IMAGES, (_, rawArgs) => {
    const args = addImagesArgsSchema.parse(rawArgs);
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
    }
  );

  ipcMain.handle(PHOTOSET_PUBLISH, (_, rawArgs) => {
    const args = idArgsSchema.parse(rawArgs);
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

  ipcMain.handle(PHOTOSET_MARK_UPLOADED, (_, rawArgs) => {
    const args = idArgsSchema.parse(rawArgs);
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
