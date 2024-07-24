import type { BrowserWindow } from 'electron';
import { addThemeEventListeners } from './theme';
import { addStorageEventListeners } from './storage';

export function registerListeners(mainWindow: BrowserWindow) {
  // Register listeners here
  addThemeEventListeners();
  addStorageEventListeners(mainWindow);
}
