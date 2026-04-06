import { z } from 'zod';

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

export interface InProgressEvent {
  current: number;
  total: number;
  path: string;
  name: string;
  id: string;
}

export const imageProcessorResizeArgsSchema = z.object({
  imagePaths: z.array(z.string()),
});

export type ImageProcessorResizeArgs = z.infer<typeof imageProcessorResizeArgsSchema>;

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

// ── Photoset row types ──────────────────────────────────────────────

export const photosetStatusSchema = z.union([z.literal('draft'), z.literal('published')]);

export type PhotosetStatus = z.infer<typeof photosetStatusSchema>;

export const photosetSchema = z.object({
  id: z.number(),
  name: z.string(),
  location: z.string().nullable(),
  year: z.number().nullable(),
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

export const photosetIdArgsSchema = z.object({ id: z.number() });

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
  location: z.string().optional(),
  year: z.number().optional(),
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
