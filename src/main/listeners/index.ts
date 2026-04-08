import type { BrowserWindow } from 'electron';

import { addCacheEventListeners } from './cache';
import { addDebugEventListeners } from './debug';
import { addImagePickerEventListeners } from './image-picker';
import { addImageProcessorEventListeners } from './image-processor';
import { addPhotosetEventListeners } from './photoset';
import { addStorageEventListeners } from './storage';
import { addThemeEventListeners } from './theme';
import { addTrpcEventListeners } from './trpc';

export function registerListeners(mainWindow: BrowserWindow) {
  // Register listeners here
  addCacheEventListeners();
  addDebugEventListeners();
  addImagePickerEventListeners();
  addPhotosetEventListeners();
  addThemeEventListeners();
  addStorageEventListeners(mainWindow);
  addTrpcEventListeners(mainWindow);
  addImageProcessorEventListeners(mainWindow);
}
