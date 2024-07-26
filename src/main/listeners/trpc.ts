import { appRouter } from '@/common/api/root';
import type { BrowserWindow } from 'electron';
import { createIPCHandler } from 'electron-trpc/main';

export function addTrpcEventListeners(window: BrowserWindow) {
  createIPCHandler({ router: appRouter, windows: [window] });
}
