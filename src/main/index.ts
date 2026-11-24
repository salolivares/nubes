import './securityRestrictions';

import { createRequire } from 'node:module';
import path from 'node:path';
import { platform } from 'node:process';

import { app } from 'electron';
import baseLog from 'electron-log/main';

import { readDotGitFile, resolveDevEnvironment } from './dev-environment';
import { Database } from './drivers/database';
import { MockS3, setS3Provider } from './drivers/s3';
import { Storage } from './drivers/storage';
import { registerListeners } from './listeners';
import { restoreOrCreateWindow } from './mainWindow';

/**
 * Pick the userData folder and S3 mode before anything else runs.
 *
 * - Packaged builds keep Electron's default folder and real S3.
 * - In dev, NUBES_USER_DATA wins, then `<worktree>/.dev-data` for linked git
 *   worktrees, then `<appData>/nubes-dev`. Each folder has its own
 *   single-instance lock, so parallel worktrees can each run the app.
 * - In dev, S3 is mocked unless NUBES_MOCK_S3=0.
 *
 * IMPORTANT: This must run before anything that reads userData
 * (Storage, Database, etc.). Do not move this below other init code.
 */
const devEnvironment = resolveDevEnvironment({
  isPackaged: app.isPackaged,
  env: process.env,
  appDataPath: app.getPath('appData'),
  appRoot: app.getAppPath(),
  dotGitFile: app.isPackaged ? null : readDotGitFile(app.getAppPath()),
});
if (devEnvironment.userDataPath) {
  app.setPath('userData', devEnvironment.userDataPath);
  // Keep logs next to the data, not in the shared ~/Library/Logs/Nubes. electron-log
  // ignores app.getPath('logs') on macOS by default, so point its file transport there too.
  const logsDir = path.join(devEnvironment.userDataPath, 'logs');
  app.setAppLogsPath(logsDir);
  baseLog.transports.file.resolvePathFn = (vars) => path.join(logsDir, vars.fileName ?? 'main.log');
}

const log = baseLog.scope('startup');

if (devEnvironment.mockS3) {
  setS3Provider(new MockS3());
}
log.info(
  `userData: ${app.getPath('userData')} (${devEnvironment.userDataSource}); ` +
    `S3: ${devEnvironment.mockS3 ? 'mock' : 'real'} (${devEnvironment.mockS3Source})`,
);
if (!app.isPackaged && process.env.NUBES_MOCK_S3 && devEnvironment.mockS3Source !== 'env') {
  log.warn(`Ignoring NUBES_MOCK_S3=${process.env.NUBES_MOCK_S3}. Use 1 or 0.`);
}

/**
 * Handle creating/removing shortcuts on Windows when installing/uninstalling.
 */
if (platform === 'win32') {
  const require = createRequire(import.meta.url);
  if (require('electron-squirrel-startup')) {
    app.quit();
  }
}

/**
 * Prevent electron from running multiple instances.
 */
const isSingleInstance = app.requestSingleInstanceLock();
if (!isSingleInstance) {
  log.error(
    `Another Nubes instance already holds the lock for ${app.getPath('userData')}. Quitting.` +
      (app.isPackaged
        ? ''
        : ' Set NUBES_USER_DATA to a different folder to run a second instance.'),
  );
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
 * Register IPC handlers and start the image worker once, then create the window.
 * Windows come and go (on macOS, closing the window keeps the app running and the
 * dock icon makes a new one), so nothing here may run per window.
 */
app
  .whenReady()
  .then(() => {
    Storage.init();
    Database.init();
    registerListeners();

    /**
     * Registered after the IPC handlers so a reopened window always has them.
     * @see https://www.electronjs.org/docs/latest/api/app#event-activate-macos Event: 'activate'.
     */
    app.on('activate', restoreOrCreateWindow);

    return restoreOrCreateWindow();
  })
  .catch((e) => console.error('Failed create window:', e));

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
