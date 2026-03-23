import { eq } from 'drizzle-orm';
import { ipcMain } from 'electron';

import {
  PHOTOSET_ADD_IMAGES,
  PHOTOSET_CREATE,
  PHOTOSET_DELETE,
  PHOTOSET_GET,
  PHOTOSET_LIST,
  PHOTOSET_PUBLISH,
  PHOTOSET_UPDATE,
} from '@/common/constants';
import { photosetImageOutputs, photosetImages, photosets } from '@/common/db/schema';
import { Database } from '@/main/drivers/database';

type PhotosetStatus = 'draft' | 'published';

function getDb() {
  return Database.instance.db;
}

export function addPhotosetEventListeners() {
  ipcMain.handle(
    PHOTOSET_LIST,
    (_, args?: { sortBy?: string; sortOrder?: string; status?: PhotosetStatus }) => {
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
    }
  );

  ipcMain.handle(PHOTOSET_GET, (_, args: { id: number }) => {
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

  ipcMain.handle(
    PHOTOSET_CREATE,
    (
      _,
      args: {
        name: string;
        bucketName: string;
        location?: string;
        year?: number;
        camera?: string;
      }
    ) => {
      const db = getDb();
      const rows = db.insert(photosets).values(args).returning().all();
      return rows[0];
    }
  );

  ipcMain.handle(
    PHOTOSET_UPDATE,
    (
      _,
      args: {
        id: number;
        name?: string;
        location?: string;
        year?: number;
        camera?: string;
        status?: PhotosetStatus;
      }
    ) => {
      const db = getDb();
      const { id, ...data } = args;
      const rows = db
        .update(photosets)
        .set({ ...data, updatedAt: new Date().toISOString() })
        .where(eq(photosets.id, id))
        .returning()
        .all();
      return rows[0];
    }
  );

  ipcMain.handle(PHOTOSET_DELETE, (_, args: { id: number }) => {
    const db = getDb();
    db.delete(photosets).where(eq(photosets.id, args.id)).run();
  });

  ipcMain.handle(
    PHOTOSET_ADD_IMAGES,
    (
      _,
      args: {
        photosetId: number;
        images: Array<{
          name: string;
          camera?: string;
          originalPath: string;
          preview?: string;
          sortOrder?: number;
          outputs: Array<{
            imagePath: string;
            type: 'jpg' | 'webp';
            resolution: number;
            byteLength: number;
          }>;
        }>;
      }
    ) => {
      const db = getDb();
      return db.transaction((tx) => {
        const insertedImages = [];

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

  ipcMain.handle(PHOTOSET_PUBLISH, (_, args: { id: number }) => {
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
}
