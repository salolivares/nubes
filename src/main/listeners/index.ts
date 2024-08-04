import type { BrowserWindow } from 'electron';

import { addImageProcessorEventListeners } from './image-processor';
import { addStorageEventListeners } from './storage';
import { addThemeEventListeners } from './theme';
import { addTrpcEventListeners } from './trpc';

export function registerListeners(mainWindow: BrowserWindow) {
  // Register listeners here
  addThemeEventListeners();
  addStorageEventListeners(mainWindow);
  addTrpcEventListeners(mainWindow);
  addImageProcessorEventListeners(mainWindow);
}
