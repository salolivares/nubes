import { createHashRouter, createRoutesFromElements, Route } from 'react-router-dom';
import { BaseLayout } from './components/base-layout';
import { GeneralSettings, Settings } from './components/Settings';
import { Home } from './components/Home';

export const router = createHashRouter(
  createRoutesFromElements(
    <Route path="/" element={<BaseLayout />}>
      <Route index element={<Home />} />
      <Route path="settings" element={<Settings />}>
        <Route index element={<GeneralSettings />} />
      </Route>
    </Route>,
  ),
);
