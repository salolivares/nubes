import path from 'node:path';

import { app } from 'electron';

import { PHOTOSETS_DIR } from '@/common/constants';

/** The folder every photoset's processed images live under. */
export function photosetsRoot(): string {
  return path.join(app.getPath('userData'), PHOTOSETS_DIR);
}

/**
 * The folder one photoset's processed images go in: `<root>/<photosetId>`. Main builds it from a
 * validated integer id, so the renderer never names a folder. Photosets made before per-photoset
 * folders keep their files directly under the root.
 */
export function photosetOutputFolder(root: string, photosetId: number): string {
  if (!Number.isSafeInteger(photosetId) || photosetId <= 0) {
    throw new Error(`Invalid photoset id: ${photosetId}`);
  }
  return path.join(root, String(photosetId));
}
