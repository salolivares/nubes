import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './components/theme-provider';

import { router } from './routes';
import { Toaster } from './components/ui/sonner';

export function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
      <Toaster />
    </ThemeProvider>
  );
}
