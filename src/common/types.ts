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
  imagePaths: z.array(outputImageSchema),
});

export type ProcessedImage = z.infer<typeof processedImageSchema>;

export interface InProgressEvent {
  current: number;
  total: number;
  path: string;
  name: string;
  id: string;
}
