import { createTRPCRouter, publicProcedure } from '../trpc';

export const bucketRouter = createTRPCRouter({
  list: publicProcedure.query(({ ctx }) => {
    return ctx.s3.listBuckets();
  }),
});
