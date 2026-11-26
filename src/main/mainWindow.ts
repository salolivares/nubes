import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BrowserWindow } from 'electron';

import { APP_ENTRY_URL } from '@/common/app-url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
