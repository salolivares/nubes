import path from 'node:path';

import { dialog } from 'electron';
import { z } from 'zod';

import { IMAGE_PICKER_ALLOW_DROPPED, IMAGE_PICKER_OPEN } from '@/common';
import { handle } from '@/main/ipc';
import { allowPickedFiles } from '@/main/media';

export function addImagePickerEventListeners() {
  handle(IMAGE_PICKER_OPEN, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }],
    });

    if (result.canceled) {
      return [];
    }

    // Previews load over nubes-media://, which only serves files on this allowlist.
    const allowed = await allowPickedFiles(result.filePaths);
    return allowed.map((filePath) => ({
      path: filePath,
      name: path.basename(filePath),
    }));
  });

  // Drops happen in the renderer, so their paths come from preload, which only sends the disk
  // paths of File objects the user dropped. allowPickedFiles keeps only absolute paths to image
  // files that exist, and returns the ones it accepted.
  handle(IMAGE_PICKER_ALLOW_DROPPED, z.array(z.string()).max(10_000), (_, paths) =>
    allowPickedFiles(paths),
  );
}
