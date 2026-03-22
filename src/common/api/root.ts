import { bucketRouter } from './routers/bucket';
import { createTRPCRouter } from './trpc';

export const appRouter = createTRPCRouter({
  bucket: bucketRouter,
});

export type AppRouter = typeof appRouter;
