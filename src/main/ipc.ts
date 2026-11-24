import { BrowserWindow, ipcMain } from 'electron';
import baseLog from 'electron-log/main';
import type { z } from 'zod';

const log = baseLog.scope('ipc');

/** True when `url` is the app's own renderer page, not a remote site. */
function isAppUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return parsed.origin === new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin;
  }
  return parsed.protocol === 'file:';
}

/**
 * Only the main window's main frame may call IPC handlers. Every BrowserWindow this app creates
 * is a main window (see `restoreOrCreateWindow`), so the check rejects:
 * - subframes (an iframe inside the page),
 * - webContents that don't belong to a BrowserWindow,
 * - a main frame that isn't showing the app's own page.
 */
export function isTrustedSender(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) {
  const frame = event.senderFrame;
  if (!frame || frame.parent !== null) return false;
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) return false;
  return isAppUrl(frame.url);
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HandleOptions {}

export function handle<S extends z.ZodType>(
  channel: string,
  schema: S,
  handler: (event: Electron.IpcMainInvokeEvent, args: z.infer<S>) => unknown,
  options?: HandleOptions,
): void;
export function handle(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, args: unknown) => unknown,
  options?: HandleOptions,
): void;
export function handle(
  channel: string,
  schemaOrHandler: unknown,
  handlerOrOptions?: unknown,
  _options?: HandleOptions,
): void {
  const hasSchema = typeof schemaOrHandler !== 'function';
  const schema = hasSchema ? (schemaOrHandler as z.ZodType) : undefined;
  const handler = (hasSchema ? handlerOrOptions : schemaOrHandler) as (
    event: Electron.IpcMainInvokeEvent,
    args: unknown,
  ) => unknown;

  ipcMain.handle(channel, async (event, rawArgs) => {
    if (!isTrustedSender(event)) {
      log.warn(`[${channel}] rejected call from untrusted sender ${event.senderFrame?.url}`);
      throw new Error('Untrusted IPC sender');
    }
    try {
      const args = schema ? schema.parse(rawArgs) : rawArgs;
      return await handler(event, args);
    } catch (err) {
      log.error(`[${channel}]`, err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface OnOptions {}

export function on<S extends z.ZodType>(
  channel: string,
  schema: S,
  handler: (event: Electron.IpcMainEvent, args: z.infer<S>) => void,
  options?: OnOptions,
): void;
export function on(
  channel: string,
  handler: (event: Electron.IpcMainEvent, args: unknown) => void,
  options?: OnOptions,
): void;
export function on(
  channel: string,
  schemaOrHandler: unknown,
  handlerOrOptions?: unknown,
  _options?: OnOptions,
): void {
  const hasSchema = typeof schemaOrHandler !== 'function';
  const schema = hasSchema ? (schemaOrHandler as z.ZodType) : undefined;
  const handler = (hasSchema ? handlerOrOptions : schemaOrHandler) as (
    event: Electron.IpcMainEvent,
    args: unknown,
  ) => void;

  ipcMain.on(channel, (event, rawArgs) => {
    if (!isTrustedSender(event)) {
      log.warn(`[${channel}] dropped message from untrusted sender ${event.senderFrame?.url}`);
      return;
    }
    try {
      const args = schema ? schema.parse(rawArgs) : rawArgs;
      handler(event, args);
    } catch (err) {
      log.error(`[${channel}]`, err);
    }
  });
}

/**
 * Push an event to every open window. Look windows up on each send instead of
 * holding a reference, because on macOS the window can be closed and recreated
 * while the app keeps running.
 */
export function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
}
