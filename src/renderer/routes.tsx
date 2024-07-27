import { createHashRouter, createRoutesFromElements, Route } from 'react-router-dom';
import { BaseLayout } from './components/base-layout';
import { Home } from './pages/Home';
import { Settings } from './pages/Settings';
import { GeneralSettings } from './pages/GeneralSettings';

export const router = createHashRouter(
  createRoutesFromElements(
    <Route path="/" element={<BaseLayout />}>
      <Route index element={<Home />} />
      <Route path="settings" element={<Settings />}>
        <Route index element={<GeneralSettings />} />
      </Route>
    </Route>
  )
);
