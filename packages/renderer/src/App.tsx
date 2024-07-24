import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './components/theme-provider';

import { router } from './routes';
import { Toaster } from './components/ui/sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc } from './lib/trpc';
import { httpBatchLink, loggerLink } from '@trpc/client';
import { trpc as preloadTrpc } from '#preload';
import superjson from 'superjson';
import type { IpcRequest } from '../../../types/api';

export function App() {
  const queryClient = new QueryClient();
  const trpcClient = trpc.createClient({
    links: [
      loggerLink({
        enabled: (opts) =>
          process.env.NODE_ENV === 'development' ||
          (opts.direction === 'down' && opts.result instanceof Error),
      }),
      httpBatchLink({
        url: '/trpc',

        // custom fetch implementation that sends the request over IPC to Main process
        fetch: async (input, init) => {
          const req: IpcRequest = {
            url:
              input instanceof URL
                ? input.toString()
                : typeof input === 'string'
                  ? input
                  : input.url,
            method: input instanceof Request ? input.method : init?.method!,
            headers: input instanceof Request ? input.headers : init?.headers!,
            body: input instanceof Request ? input.body : init?.body!,
          };

          const resp = await preloadTrpc(req);
          // Since all tRPC really needs is the JSON, and we already have the JSON deserialized,
          // construct a "fake" fetch Response object
          return {
            json: () => Promise.resolve(resp.body),
          };
        },
        transformer: new superjson(),
      }),
    ],
  });

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RouterProvider router={router} />
          <Toaster />
        </ThemeProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
