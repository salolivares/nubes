// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge } from 'electron';
import { storage } from './storage';
import { theme } from './theme';

contextBridge.exposeInMainWorld('storage', storage);
contextBridge.exposeInMainWorld('themeMode', theme);
