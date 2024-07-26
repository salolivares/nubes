import { createTRPCRouter, publicProcedure } from './trpc';
import { bucketRouter } from './routers/bucket';

export const appRouter = createTRPCRouter({
  bucket: bucketRouter,
});

export type AppRouter = typeof appRouter;
