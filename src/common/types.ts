import { z } from 'zod';

import {
  SECURE_STORAGE_KEYS,
  SECURE_STORAGE_WRITE,
  STORAGE_READ,
  STORAGE_WRITE,
} from './constants';

// ── Image processing ────────────────────────────────────────────────

export const outputImageSchema = z.object({
  imagePath: z.string(),
  type: z.union([z.literal('jpg'), z.literal('webp')]),
  resolution: z.number(),
  byteLength: z.number(),
});

export type OutputImage = z.infer<typeof outputImageSchema>;

export const processedImageSchema = z.object({
  id: z.string(),
  name: z.string(),
  camera: z.string().optional(),
  imagePaths: z.array(outputImageSchema),
  preview: z.base64().optional(),
});

export type ProcessedImage = z.infer<typeof processedImageSchema>;

export const imageErrorSchema = z.object({
  path: z.string(),
  error: z.string(),
});

export type ImageError = z.infer<typeof imageErrorSchema>;

export const imageProcessorResizeArgsSchema = z.object({
  /** The photoset the outputs belong to. Main writes them to that photoset's own folder. */
  photosetId: z.number().int().positive(),
  imagePaths: z.array(z.string()),
});

export type ImageProcessorResizeArgs = z.infer<typeof imageProcessorResizeArgsSchema>;

/** Paths preload found for dropped files, sent to main to allowlist (`IMAGE_PICKER_ALLOW_DROPPED`). */
export const imagePickerAllowDroppedArgsSchema = z.array(z.string().min(1).max(4096)).max(10_000);

export interface DroppedFiles {
  /** Files main put on the `nubes-media://` allowlist, ready to queue by path. */
  entries: { path: string; name: string }[];
  /** Names of files that were not added, because they have no path on disk or main refused them. */
  missing: string[];
}

export const imageJobIdArgsSchema = z.object({ jobId: z.string() });

export type ImageJobIdArgs = z.infer<typeof imageJobIdArgsSchema>;

// Main → worker. The worker runs one resize at a time and checks for a cancel between images.
export const imageWorkerRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('resize'),
    jobId: z.string(),
    imagePaths: z.array(z.string()),
    outputFolder: z.string(),
  }),
  z.object({ type: z.literal('cancel'), jobId: z.string() }),
]);

export type ImageWorkerRequest = z.infer<typeof imageWorkerRequestSchema>;

// Sent once per image, whether it succeeded or failed.
export const imageJobProgressEventSchema = z.object({
  type: z.literal('progress'),
  jobId: z.string(),
  current: z.number(),
  total: z.number(),
  path: z.string(),
  name: z.string(),
  error: z.string().optional(),
});

export const imageJobCompleteEventSchema = z.object({
  type: z.literal('complete'),
  jobId: z.string(),
  processedImages: z.array(processedImageSchema),
  erroredImages: z.array(imageErrorSchema),
  cancelled: z.boolean(),
});

// Worker → main. Main parses these before forwarding them.
export const imageWorkerEventSchema = z.discriminatedUnion('type', [
  imageJobProgressEventSchema,
  imageJobCompleteEventSchema,
]);

export type ImageWorkerEvent = z.infer<typeof imageWorkerEventSchema>;

// Main → renderer. Adds the events only main knows about: a job leaving the queue, and a job
// failing because the worker exited.
export const imageJobEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('started'), jobId: z.string() }),
  imageJobProgressEventSchema,
  imageJobCompleteEventSchema,
  z.object({ type: z.literal('failed'), jobId: z.string(), error: z.string() }),
]);

export type ImageJobEvent = z.infer<typeof imageJobEventSchema>;

export const imageJobStatusSchema = z.enum([
  'queued',
  'running',
  'complete',
  'cancelled',
  'failed',
]);

export type ImageJobStatus = z.infer<typeof imageJobStatusSchema>;

// What main and the renderer each build by folding ImageJobEvents with applyImageJobEvent().
export const imageJobSchema = z.object({
  jobId: z.string(),
  status: imageJobStatusSchema,
  imagePaths: z.array(z.string()),
  /** Paths the worker has finished, successfully or not. */
  donePaths: z.array(z.string()),
  processedImages: z.array(processedImageSchema),
  erroredImages: z.array(imageErrorSchema),
  /** Set when the whole job failed, e.g. the worker crashed. */
  error: z.string().nullable(),
});

export type ImageJob = z.infer<typeof imageJobSchema>;

// ── Album form ──────────────────────────────────────────────────────

export const albumSchema = z.object({
  name: z
    .string()
    .min(1, 'Album name is required')
    .max(50, 'Album name must be 50 characters or less'),
  location: z
    .string()
    .min(1, 'Location is required')
    .max(50, 'Location must be 50 characters or less'),
  year: z
    .number()
    .int()
    .min(1900, 'Year must be 1900 or later')
    .max(2100, 'Year must be 2100 or earlier'),
  published: z.boolean(),
});

export type Album = z.infer<typeof albumSchema>;

// ── S3 IPC arg schemas ──────────────────────────────────────────────

export const s3CreateAlbumArgsSchema = z.object({
  bucketName: z.string(),
  album: albumSchema,
  images: z.array(processedImageSchema),
});

export type S3CreateAlbumArgs = z.infer<typeof s3CreateAlbumArgsSchema>;

// ── Storage ─────────────────────────────────────────────────────────

export const secureStorageKeySchema = z.enum(SECURE_STORAGE_KEYS);

export type SecureStorageKey = z.infer<typeof secureStorageKeySchema>;

// Plain reads and writes can't touch secure keys. Without safeStorage the "encrypted" value is
// only base64, so a plain read would hand the secret to the renderer.
const plainStorageKeySchema = z
  .string()
  .refine(
    (key) => !secureStorageKeySchema.safeParse(key).success,
    'Credentials are only reachable through secureWrite and credentialsStatus',
  );

export const storageArgsSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal(STORAGE_READ), key: plainStorageKeySchema }),
  z.object({ action: z.literal(STORAGE_WRITE), key: plainStorageKeySchema, value: z.string() }),
  z.object({
    action: z.literal(SECURE_STORAGE_WRITE),
    key: secureStorageKeySchema,
    value: z.string(),
  }),
]);

export type StorageArgs = z.infer<typeof storageArgsSchema>;

/**
 * What the renderer may know about the saved AWS credentials. The secret itself stays in main.
 */
export const credentialsStatusSchema = z.object({
  accessKeyId: z.string().nullable(),
  hasSecret: z.boolean(),
});

export type CredentialsStatus = z.infer<typeof credentialsStatusSchema>;

/** Pushed on `STORAGE_CHANGE` when a plain (unencrypted) key changes. */
export const storageChangeSchema = z.object({
  key: z.string(),
  newValue: z.string(),
  oldValue: z.string(),
});

export type StorageChange = z.infer<typeof storageChangeSchema>;

// ── Photoset row types ──────────────────────────────────────────────

export const photosetStatusSchema = z.union([z.literal('draft'), z.literal('published')]);

export type PhotosetStatus = z.infer<typeof photosetStatusSchema>;

export const photosetSchema = z.object({
  id: z.number(),
  name: z.string(),
  location: z.string(),
  year: z.number(),
  bucketName: z.string(),
  status: photosetStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullable(),
  uploadedAt: z.string().nullable(),
});

export type Photoset = z.infer<typeof photosetSchema>;

export const photosetImageSchema = z.object({
  id: z.number(),
  photosetId: z.number(),
  name: z.string(),
  camera: z.string().nullable(),
  originalPath: z.string(),
  preview: z.string().nullable(),
  sortOrder: z.number(),
  createdAt: z.string(),
});

export type PhotosetImage = z.infer<typeof photosetImageSchema>;

export const photosetImageOutputSchema = z.object({
  id: z.number(),
  imageId: z.number(),
  imagePath: z.string(),
  type: z.union([z.literal('jpg'), z.literal('webp')]),
  resolution: z.number(),
  byteLength: z.number(),
});

export type PhotosetImageOutput = z.infer<typeof photosetImageOutputSchema>;

// ── Photoset IPC arg schemas ────────────────────────────────────────

export const photosetIdArgsSchema = z.object({ id: z.number().int().positive() });

export const photosetListArgsSchema = z
  .object({
    sortBy: z.enum(['name', 'createdAt', 'status']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    status: photosetStatusSchema.optional(),
  })
  .optional();

export type PhotosetListArgs = z.infer<typeof photosetListArgsSchema>;

export const photosetCreateArgsSchema = z.object({
  name: z.string(),
  bucketName: z.string(),
  location: z.string(),
  year: z.number(),
});

export type PhotosetCreateArgs = z.infer<typeof photosetCreateArgsSchema>;

export const photosetUpdateArgsSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  location: z.string().optional(),
  year: z.number().optional(),
  status: photosetStatusSchema.optional(),
});

export type PhotosetUpdateArgs = z.infer<typeof photosetUpdateArgsSchema>;

export const photosetAddImagesArgsSchema = z.object({
  photosetId: z.number(),
  images: z.array(
    z.object({
      name: z.string(),
      camera: z.string().optional(),
      originalPath: z.string(),
      preview: z.string().optional(),
      sortOrder: z.number().optional(),
      outputs: z.array(outputImageSchema),
    }),
  ),
});

export type PhotosetAddImagesArgs = z.infer<typeof photosetAddImagesArgsSchema>;

export const photosetShowInFolderArgsSchema = z.object({ filePath: z.string() });
export type PhotosetShowInFolderArgs = z.infer<typeof photosetShowInFolderArgsSchema>;

export const photosetRemoveFilesArgsSchema = z.object({
  filePaths: z.array(z.string()),
});

export type PhotosetRemoveFilesArgs = z.infer<typeof photosetRemoveFilesArgsSchema>;
