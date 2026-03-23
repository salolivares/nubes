import { contextBridge } from 'electron';
import { exposeElectronTRPC } from 'electron-trpc/main';

import { debug } from './debug';
import { imagePicker } from './image-picker';
import { imageProcessor } from './image-processor';
import { photosets } from './photoset';
import { storage } from './storage';
import { theme } from './theme';

contextBridge.exposeInMainWorld('storage', storage);
contextBridge.exposeInMainWorld('themeMode', theme);
contextBridge.exposeInMainWorld('imagePicker', imagePicker);
contextBridge.exposeInMainWorld('imageProcessor', imageProcessor);
contextBridge.exposeInMainWorld('photosets', photosets);
contextBridge.exposeInMainWorld('debug', debug);

(async () => {
  exposeElectronTRPC();
})();
