import './securityRestrictions';

import { createRequire } from 'node:module';
import { platform } from 'node:process';

import { app } from 'electron';

import { Storage } from './drivers/storage';
import { restoreOrCreateWindow } from './mainWindow';

const require = createRequire(import.meta.url);

/**
 * Handle creating/removing shortcuts on Windows when installing/uninstalling.
 */
if (require('electron-squirrel-startup')) {
  app.quit();
}

/**
 * Prevent electron from running multiple instances.
 */
const isSingleInstance = app.requestSingleInstanceLock();
if (!isSingleInstance) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', restoreOrCreateWindow);

/**
 * Disable Hardware Acceleration to save more system resources.
 */
app.disableHardwareAcceleration();

/**
 * Shutdown background process if all windows was closed
 */
app.on('window-all-closed', () => {
  if (platform !== 'darwin') {
    app.quit();
  }
});

/**
 * @see https://www.electronjs.org/docs/latest/api/app#event-activate-macos Event: 'activate'.
 */
app.on('activate', restoreOrCreateWindow);

/**
 * Create the application window when the background process is ready.
 */
app
  .whenReady()
  .then(() => {
    // Initialize the storage instance
    Storage.instance;
    restoreOrCreateWindow();
  })
  .catch((e) => console.error('Failed create window:', e));

/**
 * Clean up resources on app quit.
 */
app.on('before-quit', () => {});

app.on('will-quit', () => {});

/**
 * Install React devtools or any other extension in development mode only.
 */
if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
  app
    .whenReady()
    .then(() => import('electron-devtools-installer'))
    .then((module) => {
      const { default: installExtension, REACT_DEVELOPER_TOOLS } =
        //@ts-expect-error Hotfix for https://github.com/cawa-93/vite-electron-builder/issues/915
        typeof module.default === 'function' ? module : (module.default as typeof module);

      return installExtension(REACT_DEVELOPER_TOOLS, {
        loadExtensionOptions: {
          allowFileAccess: true,
        },
      });
    })
    .catch((e) => console.error('Failed install extension:', e));
}
