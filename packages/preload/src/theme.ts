import {
  THEME_MODE_CURRENT_CHANNEL,
  THEME_MODE_DARK_CHANNEL,
  THEME_MODE_LIGHT_CHANNEL,
  THEME_MODE_SYSTEM_CHANNEL,
  THEME_MODE_TOGGLE_CHANNEL,
} from '@common';
import { ipcRenderer } from 'electron';

export const current = () => ipcRenderer.invoke(THEME_MODE_CURRENT_CHANNEL);
export const toggle = () => ipcRenderer.invoke(THEME_MODE_TOGGLE_CHANNEL);
export const dark = () => ipcRenderer.invoke(THEME_MODE_DARK_CHANNEL);
export const light = () => ipcRenderer.invoke(THEME_MODE_LIGHT_CHANNEL);
export const system = () => ipcRenderer.invoke(THEME_MODE_SYSTEM_CHANNEL);
