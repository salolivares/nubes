import { z } from 'zod';

import { processedImageSchema } from '@/common/types';

import { createTRPCRouter, publicProcedure } from '../trpc';

export const bucketRouter = createTRPCRouter({
  list: publicProcedure.query(({ ctx }) => {
    return ctx.s3.listBuckets();
  }),
  createAlbum: publicProcedure
    .input(
      z.object({
        bucketName: z.string(),
        albumName: z.string(),
        images: z.array(processedImageSchema),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.s3.createAlbum(input.bucketName, input.albumName, input.images);
      // mock 3 second delay
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return { success: true };
    }),
});
