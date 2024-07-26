import { contextBridge } from 'electron';
import { storage } from './storage';
import { theme } from './theme';
import { exposeElectronTRPC } from 'electron-trpc/main';

contextBridge.exposeInMainWorld('storage', storage);
contextBridge.exposeInMainWorld('themeMode', theme);

(async () => {
  exposeElectronTRPC();
})();
