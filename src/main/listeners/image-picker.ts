import path from 'node:path';

import { dialog, ipcMain } from 'electron';
import sharp from 'sharp';

import { IMAGE_PICKER_OPEN, IMAGE_PICKER_READ_THUMBNAIL } from '@/common';

const THUMBNAIL_WIDTH = 200;

export function addImagePickerEventListeners() {
  ipcMain.handle(IMAGE_PICKER_OPEN, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }],
    });

    if (result.canceled) {
      return [];
    }

    return result.filePaths.map((filePath) => ({
      path: filePath,
      name: path.basename(filePath),
    }));
  });

  ipcMain.handle(IMAGE_PICKER_READ_THUMBNAIL, async (_, filePath: string) => {
    const buffer = await sharp(filePath)
      .resize({ width: THUMBNAIL_WIDTH })
      .jpeg({ quality: 80 })
      .toBuffer();

    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  });
}
