import type { BrowserWindow } from 'electron';

import { addCacheEventListeners } from './cache';
import { addDebugEventListeners } from './debug';
import { addImagePickerEventListeners } from './image-picker';
import { addImageProcessorEventListeners } from './image-processor';
import { addPhotosetEventListeners } from './photoset';
import { addS3EventListeners } from './s3';
import { addStorageEventListeners } from './storage';
import { addThemeEventListeners } from './theme';

export function registerListeners(mainWindow: BrowserWindow) {
  // Register listeners here
  addCacheEventListeners();
  addDebugEventListeners();
  addImagePickerEventListeners();
  addPhotosetEventListeners();
  addS3EventListeners();
  addThemeEventListeners();
  addStorageEventListeners(mainWindow);
  addImageProcessorEventListeners(mainWindow);
}
