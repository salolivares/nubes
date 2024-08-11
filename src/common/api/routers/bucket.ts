import { z } from 'zod';

import { albumSchema, processedImageSchema } from '@/common/types';

import { createTRPCRouter, publicProcedure } from '../trpc';

export const bucketRouter = createTRPCRouter({
  list: publicProcedure.query(({ ctx }) => {
    return ctx.s3.listBuckets();
  }),
  createAlbum: publicProcedure
    .input(
      z.object({
        bucketName: z.string(),
        album: albumSchema,
        images: z.array(processedImageSchema),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.s3.createAlbum(input.bucketName, input.album, input.images);
    }),
});
