import { bucketRouter } from './routers/bucket';
import { createTRPCRouter, publicProcedure } from './trpc';

export const appRouter = createTRPCRouter({
  bucket: bucketRouter,
});

export type AppRouter = typeof appRouter;
