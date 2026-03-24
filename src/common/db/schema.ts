import { relations } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const photosets = sqliteTable('photosets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  location: text('location'),
  year: integer('year'),
  bucketName: text('bucket_name').notNull(),
  status: text('status', { enum: ['draft', 'published'] })
    .notNull()
    .default('draft'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  publishedAt: text('published_at'),
  uploadedAt: text('uploaded_at'),
});

export const photosetImages = sqliteTable('photoset_images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  photosetId: integer('photoset_id')
    .notNull()
    .references(() => photosets.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  camera: text('camera'),
  originalPath: text('original_path').notNull(),
  preview: text('preview'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const photosetImageOutputs = sqliteTable('photoset_image_outputs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  imageId: integer('image_id')
    .notNull()
    .references(() => photosetImages.id, { onDelete: 'cascade' }),
  imagePath: text('image_path').notNull(),
  type: text('type', { enum: ['jpg', 'webp'] }).notNull(),
  resolution: integer('resolution').notNull(),
  byteLength: integer('byte_length').notNull(),
});

// Relations (for drizzle relational queries)

export const photosetsRelations = relations(photosets, ({ many }) => ({
  images: many(photosetImages),
}));

export const photosetImagesRelations = relations(photosetImages, ({ one, many }) => ({
  photoset: one(photosets, {
    fields: [photosetImages.photosetId],
    references: [photosets.id],
  }),
  outputs: many(photosetImageOutputs),
}));

export const photosetImageOutputsRelations = relations(photosetImageOutputs, ({ one }) => ({
  image: one(photosetImages, {
    fields: [photosetImageOutputs.imageId],
    references: [photosetImages.id],
  }),
}));
