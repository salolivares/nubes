import { BrowserWindow, nativeTheme } from 'electron';

import { handle } from '@/main/ipc';

import {
  THEME_MODE_CURRENT_CHANNEL,
  THEME_MODE_DARK_CHANNEL,
  THEME_MODE_LIGHT_CHANNEL,
  THEME_MODE_SYSTEM_CHANNEL,
  THEME_MODE_TOGGLE_CHANNEL,
  THEME_SOURCE_STORAGE_KEY,
} from '../../common/constants';
import { Storage } from '../drivers/storage';
import type { ThemeSource } from '../window/theme';
import { parseThemeSource, windowBackgroundColor } from '../window/theme';

/** Apply a theme and save it, so the next launch opens in it. */
function setThemeSource(source: ThemeSource) {
  nativeTheme.themeSource = source;
  Storage.instance.write(THEME_SOURCE_STORAGE_KEY, source);
}

/**
 * Restores the saved theme before the first window opens, so the window background and the
 * page's `prefers-color-scheme` match it from the first frame.
 */
export function addThemeEventListeners() {
  nativeTheme.themeSource = parseThemeSource(Storage.instance.read(THEME_SOURCE_STORAGE_KEY));

  // Keep the color behind the page in step with the theme, for resizes and reloads.
  nativeTheme.on('updated', () => {
    const color = windowBackgroundColor(nativeTheme.shouldUseDarkColors);
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.setBackgroundColor(color);
    }
  });

  handle(THEME_MODE_CURRENT_CHANNEL, () => nativeTheme.themeSource);
  handle(THEME_MODE_TOGGLE_CHANNEL, () => {
    setThemeSource(nativeTheme.shouldUseDarkColors ? 'light' : 'dark');
    return nativeTheme.shouldUseDarkColors;
  });
  handle(THEME_MODE_DARK_CHANNEL, () => setThemeSource('dark'));
  handle(THEME_MODE_LIGHT_CHANNEL, () => setThemeSource('light'));
  handle(THEME_MODE_SYSTEM_CHANNEL, () => {
    setThemeSource('system');
    return nativeTheme.shouldUseDarkColors;
  });
}
