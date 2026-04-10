import type { BrowserWindow } from 'electron';
import { createIPCHandler } from 'electron-trpc/main';

import { appRouter } from '@/common/api/root';
import { createTRPCContext } from '@/common/api/trpc';
import { S3_UPLOAD_PROGRESS } from '@/common/constants';

export function addTrpcEventListeners(window: BrowserWindow) {
  createIPCHandler({
    router: appRouter,
    windows: [window],
    createContext: async (opts) => {
      const ctx = await createTRPCContext(opts);
      ctx.onUploadProgress = (current: number, total: number) => {
        window.webContents.send(S3_UPLOAD_PROGRESS, { current, total });
      };
      return ctx;
    },
  });
}
