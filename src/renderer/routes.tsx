import { createHashRouter, createRoutesFromElements, Route } from 'react-router-dom';
import { BaseLayout } from './components/base-layout';
import { Home } from './pages/Home';
import { Settings } from './pages/Settings';
import { GeneralSettings } from './pages/GeneralSettings';
import { BucketViewer } from './pages/BucketBrowser';
import { ImageUpload } from './pages/ImageUpload';

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
