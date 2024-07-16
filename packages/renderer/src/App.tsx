import {
  createHashRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from 'react-router-dom';
import { ThemeProvider } from './components/theme-provider';
import { Settings } from './components/settings/Settings';
import { BaseLayout } from './components/base-layout';
import { Home } from './components/Home';
import { GeneralSettings } from './components/settings';

const router = createHashRouter(
  createRoutesFromElements(
    <Route path="/" element={<BaseLayout />}>
      <Route index element={<Home />} />
      <Route path="settings" element={<Settings />}>
        <Route index element={<GeneralSettings />} />
      </Route>
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
