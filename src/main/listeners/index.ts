import { addCacheEventListeners } from './cache';
import { addDebugEventListeners } from './debug';
import { addGitHubEventListeners } from './github';
import { addImagePickerEventListeners } from './image-picker';
import { addImageProcessorEventListeners } from './image-processor';
import { addPhotosetEventListeners } from './photoset';
import { addS3EventListeners } from './s3';
import { addStorageEventListeners } from './storage';
import { addThemeEventListeners } from './theme';

/**
 * Register every IPC handler and start the image worker. Call this once, after
 * `app.whenReady()`, not per window: `ipcMain.handle` throws on a second handler
 * for the same channel, and each call would fork another worker.
 */
export function registerListeners() {
  addCacheEventListeners();
  addDebugEventListeners();
  addImagePickerEventListeners();
  addPhotosetEventListeners();
  addS3EventListeners();
  addGitHubEventListeners();
  addThemeEventListeners();
  addStorageEventListeners();
  addImageProcessorEventListeners();
}
