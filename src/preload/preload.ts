import { contextBridge } from 'electron';
import { exposeElectronTRPC } from 'electron-trpc/main';

import { cache } from './cache';
import { debug } from './debug';
import { imagePicker } from './image-picker';
import { imageProcessor } from './image-processor';
import { photosets } from './photoset';
import { storage } from './storage';
import { theme } from './theme';

contextBridge.exposeInMainWorld('cache', cache);
contextBridge.exposeInMainWorld('storage', storage);
contextBridge.exposeInMainWorld('themeMode', theme);
contextBridge.exposeInMainWorld('imagePicker', imagePicker);
contextBridge.exposeInMainWorld('imageProcessor', imageProcessor);
contextBridge.exposeInMainWorld('photosets', photosets);
if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
  contextBridge.exposeInMainWorld('debug', debug);
}

(async () => {
  exposeElectronTRPC();
})();
