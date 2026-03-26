import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { loggerLink } from '@trpc/client';
import { ipcLink } from 'electron-trpc/renderer';
import { useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { RouterProvider } from 'react-router-dom';
import superjson from 'superjson';

import { AppErrorFallback } from './components/error-fallback';
import { ThemeProvider } from './components/theme-provider';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import { trpc } from './lib/trpc';
import { router } from './routes';

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        loggerLink({
          enabled: (opts) =>
            (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') ||
            (opts.direction === 'down' && opts.result instanceof Error),
        }),
        ipcLink(),
      ],
      transformer: superjson,
    })
  );

  return (
    <ErrorBoundary FallbackComponent={AppErrorFallback}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <TooltipProvider>
              <RouterProvider router={router} />
              <Toaster />
            </TooltipProvider>
          </ThemeProvider>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </trpc.Provider>
    </ErrorBoundary>
  );
}
