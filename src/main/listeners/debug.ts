import fsp from 'node:fs/promises';
import path from 'node:path';

import { sql } from 'drizzle-orm';
import { app, clipboard, ipcMain, shell } from 'electron';

import {
  DB_FILENAME,
  DEBUG_CLEAR_DB,
  DEBUG_COPY_TO_CLIPBOARD,
  DEBUG_GET_DB_PATH,
  DEBUG_GET_MOCK_S3_PATH,
  DEBUG_IS_MOCK_S3,
  DEBUG_OPEN_MOCK_S3_PATH,
  DEBUG_SET_MOCK_S3,
} from '@/common';

import { Database } from '../drivers/database';
import { getMockS3Path, getS3Provider, MockS3, S3, setS3Provider } from '../drivers/s3';

export function addDebugEventListeners() {
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return;
  }

  setS3Provider(new MockS3());

  ipcMain.handle(DEBUG_SET_MOCK_S3, (_, enabled: boolean) => {
    if (enabled) {
      setS3Provider(new MockS3());
    } else {
      setS3Provider(S3.instance);
    }
  });

  ipcMain.handle(DEBUG_IS_MOCK_S3, () => {
    return getS3Provider() instanceof MockS3;
  });

  ipcMain.handle(DEBUG_GET_MOCK_S3_PATH, () => {
    return getMockS3Path();
  });

  ipcMain.handle(DEBUG_OPEN_MOCK_S3_PATH, async () => {
    const mockPath = getMockS3Path();
    await fsp.mkdir(mockPath, { recursive: true });
    return shell.openPath(mockPath);
  });

  ipcMain.handle(DEBUG_GET_DB_PATH, () => {
    return path.join(app.getPath('userData'), DB_FILENAME);
  });

  ipcMain.handle(DEBUG_COPY_TO_CLIPBOARD, (_, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle(DEBUG_CLEAR_DB, () => {
    const { db } = Database.instance;
    db.run(sql`DELETE FROM photoset_image_outputs`);
    db.run(sql`DELETE FROM photoset_images`);
    db.run(sql`DELETE FROM photosets`);
  });
}
