import { contextBridge } from 'electron';
import { exposeElectronTRPC } from 'electron-trpc/main';

import { imageProcessor } from './image-processor';
import { storage } from './storage';
import { theme } from './theme';

contextBridge.exposeInMainWorld('storage', storage);
contextBridge.exposeInMainWorld('themeMode', theme);
contextBridge.exposeInMainWorld('imageProcessor', imageProcessor);

(async () => {
  exposeElectronTRPC();
})();
