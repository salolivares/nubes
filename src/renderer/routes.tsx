import { createHashRouter, createRoutesFromElements, Route } from 'react-router-dom';

import { BaseLayout } from './components/base-layout';
import { routePatterns } from './lib/paths';
import { CameraSettings } from './pages/CameraSettings';
import { GeneralSettings } from './pages/GeneralSettings';
import { Home } from './pages/Home';
import { ImagePicker } from './pages/ImagePicker';
import { ImageProcessing } from './pages/ImageProcessing';
import { NewUpload } from './pages/NewUpload';
import { PhotosetDetail } from './pages/PhotosetDetail';
import { S3Summary } from './pages/S3Summary';
import { S3Upload } from './pages/S3Upload';
import { Settings } from './pages/Settings';
import { StorageSettings } from './pages/StorageSettings';

/** The route tree, exported so tests can match URLs against it. */
export const routeTree = createRoutesFromElements(
  <Route path={routePatterns.home} element={<BaseLayout />}>
    <Route index element={<Home />} />
    <Route path={routePatterns.newUpload} element={<NewUpload />} />
    <Route path={routePatterns.photoset} element={<PhotosetDetail />} />
    {/* Upload wizard. Each step loads the photoset from the DB, so a reload keeps your place. */}
    <Route path={routePatterns.wizard.picker} element={<ImagePicker />} />
    <Route path={routePatterns.wizard.upload} element={<ImageProcessing />} />
    <Route path={routePatterns.wizard.s3} element={<S3Upload />} />
    <Route path={routePatterns.wizard.summary} element={<S3Summary />} />
    <Route path={routePatterns.settings.general} element={<Settings />}>
      <Route index element={<GeneralSettings />} />
      <Route path={routePatterns.settings.cameras} element={<CameraSettings />} />
      <Route path={routePatterns.settings.storage} element={<StorageSettings />} />
    </Route>
  </Route>,
);

export const router = createHashRouter(routeTree, {
  // Opt in to React Router v7 behavior now. This silences the v6 deprecation warnings and
  // makes a later v7 upgrade a no-op for these. v7_startTransition is set on RouterProvider.
  future: {
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_relativeSplatPath: true,
    v7_skipActionErrorRevalidation: true,
  },
});
