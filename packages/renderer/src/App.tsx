import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './components/theme-provider';

import { router } from './routes';
import { Toaster } from './components/ui/sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, trpcClient } from './lib/trpc';

export function App() {
  const queryClient = new QueryClient();

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
