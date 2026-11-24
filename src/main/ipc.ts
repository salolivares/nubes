import { BrowserWindow, ipcMain } from 'electron';
import baseLog from 'electron-log/main';
import type { z } from 'zod';

const log = baseLog.scope('ipc');

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
