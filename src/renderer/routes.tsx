import { createHashRouter, createRoutesFromElements, Route } from 'react-router-dom';

import { BaseLayout } from './components/base-layout';
import { BucketViewer } from './pages/BucketBrowser';
import { GeneralSettings } from './pages/GeneralSettings';
import { Home } from './pages/Home';
import { ImageUpload } from './pages/ImageUpload';
import { Settings } from './pages/Settings';

export const router = createHashRouter(
  createRoutesFromElements(
    <Route path="/" element={<BaseLayout />}>
      <Route index element={<Home />} />
      <Route path="/bucket/:bucketName" element={<BucketViewer />} />
      <Route path="/bucket/:bucketName/upload" element={<ImageUpload />} />
      <Route path="settings" element={<Settings />}>
        <Route index element={<GeneralSettings />} />
      </Route>
    </Route>
  )
);
