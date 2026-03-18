import fsp from 'node:fs/promises';

import { ipcMain, shell } from 'electron';

import { getMockS3Path, getS3Provider, MockS3, S3, setS3Provider } from '../drivers/s3';

export function addDebugEventListeners() {
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return;
  }

  setS3Provider(new MockS3());

  ipcMain.handle('debug:setMockS3', (_, enabled: boolean) => {
    if (enabled) {
      setS3Provider(new MockS3());
    } else {
      setS3Provider(S3.instance);
    }
  });

  ipcMain.handle('debug:isMockS3', () => {
    return getS3Provider() instanceof MockS3;
  });

  ipcMain.handle('debug:getMockS3Path', () => {
    return getMockS3Path();
  });

  ipcMain.handle('debug:openMockS3Path', async () => {
    const mockPath = getMockS3Path();
    await fsp.mkdir(mockPath, { recursive: true });
    return shell.openPath(mockPath);
  });
}
