import { nativeTheme } from 'electron';

import { handle } from '@/main/ipc';

import {
  THEME_MODE_CURRENT_CHANNEL,
  THEME_MODE_DARK_CHANNEL,
  THEME_MODE_LIGHT_CHANNEL,
  THEME_MODE_SYSTEM_CHANNEL,
  THEME_MODE_TOGGLE_CHANNEL,
} from '../../common/constants';

export function addThemeEventListeners() {
  handle(THEME_MODE_CURRENT_CHANNEL, () => nativeTheme.themeSource);
  handle(THEME_MODE_TOGGLE_CHANNEL, () => {
    if (nativeTheme.shouldUseDarkColors) {
      nativeTheme.themeSource = 'light';
    } else {
      nativeTheme.themeSource = 'dark';
    }
    return nativeTheme.shouldUseDarkColors;
  });
  handle(THEME_MODE_DARK_CHANNEL, () => (nativeTheme.themeSource = 'dark'));
  handle(THEME_MODE_LIGHT_CHANNEL, () => (nativeTheme.themeSource = 'light'));
  handle(THEME_MODE_SYSTEM_CHANNEL, () => {
    nativeTheme.themeSource = 'system';
    return nativeTheme.shouldUseDarkColors;
  });
}
