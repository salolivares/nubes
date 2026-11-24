import path from 'node:path';

import { dialog } from 'electron';

import { IMAGE_PICKER_ALLOW_DROPPED, IMAGE_PICKER_OPEN } from '@/common';
import { imagePickerAllowDroppedArgsSchema } from '@/common/types';
import { handle } from '@/main/ipc';
import { allowPickedFiles } from '@/main/media';

const UNC_PATH = /^[\\/]{2}/;

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

  // Drops happen in the renderer, so these paths come from preload, which only sends the disk paths
  // of real File objects the page dropped. That stops page code from naming paths. A compromised
  // renderer process can still call this channel with any paths, so treat them as untrusted:
  // allowPickedFiles keeps only absolute paths to image files that exist.
  handle(IMAGE_PICKER_ALLOW_DROPPED, imagePickerAllowDroppedArgsSchema, (_, paths) =>
    // Skip UNC paths (\\host\share or //host/share). On Windows, resolving one opens an SMB
    // connection, which a compromised renderer could use to leak credentials. The open dialog can
    // still pick files from network shares.
    allowPickedFiles(paths.filter((p) => !UNC_PATH.test(p))),
  );
}
