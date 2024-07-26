import { appRouter } from '@/common/api/root';
import { createTRPCContext } from '@/common/api/trpc';
import type { BrowserWindow } from 'electron';
import { createIPCHandler } from 'electron-trpc/main';

export function addTrpcEventListeners(window: BrowserWindow) {
  createIPCHandler({ router: appRouter, windows: [window], createContext: createTRPCContext });
}
