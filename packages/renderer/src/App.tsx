import {
  createHashRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from 'react-router-dom';
import { ThemeProvider } from './components/theme-provider';
import { Settings } from './components/Settings';
import { BaseLayout } from './components/base-layout';
import { Home } from './components/Home';

const router = createHashRouter(
  createRoutesFromElements(
    <Route path="/" element={<BaseLayout />}>
      <Route index element={<Home />} />
      <Route path="settings" element={<Settings />} />
    </Route>,
  ),
);

export function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
