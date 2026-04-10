import { initTRPC } from '@trpc/server';
import type { CreateContextOptions } from 'electron-trpc/main';
import superjson from 'superjson';
import { ZodError } from 'zod';

import type { IS3Provider, UploadProgressCallback } from '@/main/drivers/s3';
import { getS3Provider } from '@/main/drivers/s3';

/**
 * This helper generates the "internals" for a tRPC context. If you need to use it, you can export
 * it from here.
 *
 * Examples of things you may need it for:
 * - testing, so we don't have to mock Next.js' req/res
 *
 */
const createInnerTRPCContext = (): {
  s3: IS3Provider;
  onUploadProgress?: UploadProgressCallback;
} => {
  return {
    s3: getS3Provider(),
  };
};

/**
 * This is the actual context you will use in your router. It will be used to process every request
 * that goes through your tRPC endpoint.
 *
 * @see https://trpc.io/docs/context
 */
export const createTRPCContext = async (_opts: CreateContextOptions) => {
  return createInnerTRPCContext();
};

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
