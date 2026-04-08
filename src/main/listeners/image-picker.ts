import fs from 'node:fs';
import path from 'node:path';

import { dialog } from 'electron';
import sharp from 'sharp';
import { z } from 'zod';

import { IMAGE_PICKER_OPEN, IMAGE_PICKER_READ_PREVIEW, IMAGE_PICKER_READ_THUMBNAIL } from '@/common';
import { handle } from '@/main/ipc';

const THUMBNAIL_WIDTH = 200;

export function addImagePickerEventListeners() {
  handle(IMAGE_PICKER_OPEN, async () => {
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

  handle(IMAGE_PICKER_READ_THUMBNAIL, z.string(), async (_, filePath) => {
    const buffer = await sharp(filePath)
      .resize({ width: THUMBNAIL_WIDTH })
      .jpeg({ quality: 80 })
      .toBuffer();

    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  });

  handle(IMAGE_PICKER_READ_PREVIEW, z.string(), async (_, filePath) => {
    const buffer = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).slice(1);
    const mime = ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  });
}
