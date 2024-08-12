import { z } from 'zod';

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
  preview: z.string().base64(),
});

export type ProcessedImage = z.infer<typeof processedImageSchema>;

export interface InProgressEvent {
  current: number;
  total: number;
  path: string;
  name: string;
  id: string;
}

export const albumSchema = z.object({
  name: z
    .string()
    .min(1, 'Album name is required')
    .max(50, 'Album name must be 50 characters or less'),
  location: z
    .string()
    .min(1, 'Location is required')
    .max(50, 'Location must be 50 characters or less'),
  year: z.coerce
    .number()
    .int()
    .min(1900, 'Year must be 1900 or later')
    .max(2100, 'Year must be 2100 or earlier'),
  published: z.boolean(),
});

export type Album = z.infer<typeof albumSchema>;
