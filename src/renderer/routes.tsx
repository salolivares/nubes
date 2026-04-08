import { createHashRouter, createRoutesFromElements, Route } from 'react-router-dom';

import { BaseLayout } from './components/base-layout';
import { BucketViewer } from './pages/BucketBrowser';
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

export const router = createHashRouter(
  createRoutesFromElements(
    <Route path="/" element={<BaseLayout />}>
      <Route index element={<Home />} />
      <Route path="new" element={<NewUpload />} />
      <Route path="photoset/:photosetId" element={<PhotosetDetail />} />
      <Route path="bucket/:bucketName" element={<BucketViewer />} />
      <Route path="bucket/:bucketName/picker" element={<ImagePicker />} />
      <Route path="bucket/:bucketName/upload" element={<ImageProcessing />} />
      <Route path="bucket/:bucketName/s3" element={<S3Upload />} />
      <Route path="bucket/:bucketName/summary" element={<S3Summary />} />
      <Route path="settings" element={<Settings />}>
        <Route index element={<GeneralSettings />} />
        <Route path="cameras" element={<CameraSettings />} />
        <Route path="storage" element={<StorageSettings />} />
      </Route>
    </Route>
  )
);
