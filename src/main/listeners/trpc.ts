import type { BrowserWindow } from 'electron';
import { createIPCHandler } from 'electron-trpc/main';

import { appRouter } from '@/common/api/root';
import { createTRPCContext } from '@/common/api/trpc';

export function addTrpcEventListeners(window: BrowserWindow) {
  createIPCHandler({ router: appRouter, windows: [window], createContext: createTRPCContext });
}
