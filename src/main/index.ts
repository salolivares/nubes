import './securityRestrictions';

import { createRequire } from 'node:module';
import path from 'node:path';
import { platform } from 'node:process';

import { app, dialog, protocol } from 'electron';
import baseLog from 'electron-log/main';

import { APP_SCHEME_PRIVILEGES, registerAppProtocol } from './app-protocol';
import { createErrorHandler } from './crash-handling';
import { readDotGitFile, resolveDevEnvironment } from './dev-environment';
import { Database } from './drivers/database';
import { MockS3, setS3Provider } from './drivers/s3';
import { Storage } from './drivers/storage';
import { registerListeners } from './listeners';
import { rendererDir, restoreOrCreateWindow } from './mainWindow';
import { MEDIA_SCHEME_PRIVILEGES, registerMediaProtocol } from './media';

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

/**
 * Every main-process error that nothing else caught ends up here. Until the first window has
 * loaded, any error shows a dialog and quits, so a packaged build never fails to open silently.
 * After that, errors are logged and the app keeps running, unless they are fatal (a corrupt
 * database, or a UserFacingError). Registered right after the userData setup, so the log lands
 * in the right folder.
 */
const errors = createErrorHandler({
  log: baseLog.scope('crash'),
  showErrorBox: (title, content) => dialog.showErrorBox(title, content),
  // During startup no window is open and no worker is running, so exit at once with a failure
  // code. Later, quit() runs the before-quit hooks that stop the image worker.
  quit: (duringStartup) => (duringStartup ? app.exit(1) : app.quit()),
});
process.on('uncaughtException', (error) => errors.handle('uncaughtException', error));
process.on('unhandledRejection', (reason) => errors.handle('unhandledRejection', reason));
app.on('before-quit', () => errors.appQuitting());

if (devEnvironment.mockS3) {
  setS3Provider(new MockS3());
}
// The macOS About panel shows this as "Version 1.2.0 (abc1234)".
app.setAboutPanelOptions({
  applicationVersion: NUBES_BUILD_VERSION,
  ...(NUBES_BUILD_COMMIT && { version: NUBES_BUILD_COMMIT }),
});
log.info(`Nubes ${NUBES_BUILD_VERSION} (${NUBES_BUILD_COMMIT ?? 'unknown commit'})`);
log.info(
  `userData:${app.getPath('userData')} (${devEnvironment.userDataSource}); ` +
    `S3: ${devEnvironment.mockS3 ? 'mock' : 'real'} (${devEnvironment.mockS3Source})`,
);
if (devEnvironment.background) {
  log.info('Running in the background (NUBES_BACKGROUND=1): no dock icon, no focus.');
  // An accessory app has no dock icon and never becomes the frontmost app on its own.
  if (platform === 'darwin') app.setActivationPolicy('accessory');
} else if (!app.isPackaged && platform === 'darwin') {
  // A packaged build gets its icon from the app bundle. In dev the dock would show Electron's.
  app.dock?.setIcon(path.join(app.getAppPath(), 'assets', 'icon.png'));
}
if (!app.isPackaged && process.env.NUBES_MOCK_S3 && devEnvironment.mockS3Source !== 'env') {
  log.warn(`Ignoring NUBES_MOCK_S3=${process.env.NUBES_MOCK_S3}. Use 1 or 0.`);
}

/**
 * Privileged schemes must be declared before `app` is ready, in a single call: a second call
 * replaces the first. The handlers are registered below.
 */
protocol.registerSchemesAsPrivileged([APP_SCHEME_PRIVILEGES, MEDIA_SCHEME_PRIVILEGES]);

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
    registerMediaProtocol();
    // Dev loads the page from the Vite dev server instead.
    if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) registerAppProtocol(rendererDir());

    /**
     * Registered after the IPC handlers and protocols, so a reopened window always has them.
     * A second launch during startup is ignored: the first window is about to show anyway.
     * A window that fails to open later is logged and destroyed; the app keeps running.
     * @see https://www.electronjs.org/docs/latest/api/app#event-activate-macos Event: 'activate'.
     */
    const reopenWindow = () =>
      restoreOrCreateWindow().catch((error: unknown) =>
        log.error('Failed to open a window:', error),
      );
    app.on('activate', reopenWindow);
    app.on('second-instance', reopenWindow);

    return restoreOrCreateWindow({ background: devEnvironment.background });
  })
  .then(() => errors.startupComplete())
  .catch((error: unknown) => errors.handle('startup', error));

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
    .catch((error: unknown) => log.warn('Failed to install React DevTools:', error));
}
