import type { BrowserWindow } from 'electron';
import { addThemeEventListeners } from './theme';

export function registerListeners(mainWindow: BrowserWindow) {
  // Register listeners here
  addThemeEventListeners();
}
