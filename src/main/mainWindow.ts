import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { WebContents } from 'electron';
import { app, BrowserWindow, dialog } from 'electron';
import baseLog from 'electron-log/main';

import { APP_ENTRY_URL } from '@/common/app-url';

import { createRetryLimiter } from './crash-handling';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = baseLog.scope('window');

/** How often a crashed renderer is reloaded before the user gets an error instead. */
export const RENDERER_RELOAD_LIMIT = { max: 3, windowMs: 60_000 };

/** A URL fit for the log: no query string or fragment, which could carry user data. */
function loggableUrl(url: string): string {
  try {
    const { protocol, host, pathname } = new URL(url);
    return `${protocol}//${host}${pathname}`;
  } catch {
    return '<invalid url>';
  }
}

/**
 * Reload the page when its renderer process dies, so the window doesn't stay blank. A renderer
 * that keeps crashing gets RENDERER_RELOAD_LIMIT reloads, then the user sees an error and quits.
 * Also logs pages and preloads that fail to load. Logs carry URLs and error messages only.
 */
function watchWebContents(browserWindow: BrowserWindow, webContents: WebContents) {
  const reloads = createRetryLimiter(RENDERER_RELOAD_LIMIT);
  let gaveUp = false;

  webContents.on('render-process-gone', (_event, { reason, exitCode }) => {
    // clean-exit is the renderer shutting down on purpose, for example while the window closes.
    if (reason === 'clean-exit') {
      log.info('Renderer exited cleanly');
      return;
    }
    if (browserWindow.isDestroyed() || gaveUp) return;
    if (reloads.tryAcquire()) {
      log.error(`Renderer gone (${reason}, exit code ${exitCode}). Reloading.`);
      webContents.reload();
      return;
    }
    log.error(
      `Renderer gone (${reason}, exit code ${exitCode}). Reload limit reached, ` +
        `${RENDERER_RELOAD_LIMIT.max} in ${RENDERER_RELOAD_LIMIT.windowMs / 1000}s.`,
    );
    gaveUp = true;
    void dialog
      .showMessageBox(browserWindow, {
        type: 'error',
        title: 'Nubes stopped working',
        message: 'The Nubes window keeps crashing.',
        detail: `It crashed ${RENDERER_RELOAD_LIMIT.max + 1} times in a minute. The log file has the details. Quit and open Nubes again.`,
        buttons: ['Quit'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      .finally(() => app.quit());
  });

  webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      log.error(
        `Failed to load ${loggableUrl(validatedURL)}${isMainFrame ? '' : ' (subframe)'}: ` +
          `${errorDescription} (${errorCode})`,
      );
    },
  );

  webContents.on('preload-error', (_event, preloadPath, error) => {
    log.error(`Preload ${path.basename(preloadPath)} failed:`, error);
  });
}

/** The renderer bundle `nubes://app/` serves. Not used in dev, which loads over http. */
export function rendererDir() {
  return path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`);
}

interface WindowOptions {
  /** Show the window without activating the app or taking focus. */
  background?: boolean;
}

async function createWindow({ background = false }: WindowOptions) {
  const browserWindow = new BrowserWindow({
    title: 'Nubes',
    show: false, // Use the 'ready-to-show' event to show the instantiated BrowserWindow.
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false, // The webview tag is not recommended. Consider alternatives like an iframe or Electron's BrowserView. @see https://www.electronjs.org/docs/latest/api/webview-tag#warning
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  watchWebContents(browserWindow, browserWindow.webContents);

  /**
   * If the 'show' property of the BrowserWindow's constructor is omitted from the initialization options,
   * it then defaults to 'true'. This can cause flickering as the window loads the html content,
   * and it also has show problematic behaviour with the closing of the window.
   * Use `show: false` and listen to the  `ready-to-show` event to show the window.
   *
   * @see https://github.com/electron/electron/issues/25012 for the afford mentioned issue.
   */
  browserWindow.on('ready-to-show', () => {
    // show() activates the app and takes focus from whatever window the user is in.
    if (background) {
      browserWindow?.showInactive();
    } else {
      browserWindow?.show();
    }

    // DevTools opens in its own window, which would take focus too.
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL && !background) {
      browserWindow?.webContents.openDevTools();
    }
  });

  /**
   * Load the main page of the main window.
   */
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    /**
     * Load from the Vite dev server for development.
     */
    await browserWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    /**
     * Packaged and built (e2e) runs load the bundle over `nubes://app/`, served by
     * src/main/app-protocol/. Never file://, where CSP 'self' would match the whole disk.
     */
    await browserWindow.loadURL(APP_ENTRY_URL);
  }

  return browserWindow;
}

/**
 * Restore an existing BrowserWindow or Create a new BrowserWindow.
 * With `background`, a new window opens without taking focus and an existing one is left alone.
 */
export async function restoreOrCreateWindow(options: WindowOptions = {}) {
  let window = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());

  if (window === undefined) {
    window = await createWindow(options);
  }

  if (options.background) return;

  if (window.isMinimized()) {
    window.restore();
  }

  window.focus();
}
