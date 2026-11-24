import type { PhotosetAddImagesArgs, ProcessedImage } from '@/common/types';

import type { MediaAccess } from './access';

/**
 * Checks for file paths the renderer sends over IPC. They share `MediaAccess` with the
 * `nubes-media://` protocol, so a path main will read, upload or delete passes the same gate as a
 * path the renderer may display.
 */

function refused(action: string, paths: string[]): Error {
  const shown = paths.slice(0, 3).join(', ');
  const more = paths.length > 3 ? ` and ${paths.length - 3} more` : '';
  return new Error(
    `Refused to ${action} ${paths.length} file(s) outside the allowed folders: ${shown}${more}`,
  );
}

/**
 * Every upload path must be an image in the photosets folder. One bad path refuses the whole
 * album. A missing file passes, so the S3 driver reports it the way it always has.
 */
export async function assertUploadPaths(access: MediaAccess, images: ProcessedImage[]) {
  const bad: string[] = [];
  for (const image of images) {
    for (const { imagePath } of image.imagePaths) {
      const check = await access.checkFile(imagePath);
      if (!check.ok && check.status !== 404) bad.push(imagePath);
    }
  }
  if (bad.length > 0) throw refused('upload', bad);
}

/**
 * Resize sources must be files the user picked this session, or images in the photosets folder.
 * A missing file passes, so the worker reports it per image as before.
 */
export async function assertResizePaths(access: MediaAccess, imagePaths: string[]) {
  const bad: string[] = [];
  for (const imagePath of imagePaths) {
    const check = await access.checkFile(imagePath, { picked: true });
    if (!check.ok && check.status !== 404) bad.push(imagePath);
  }
  if (bad.length > 0) throw refused('process', bad);
}

/** The paths that are existing images in the photosets folder. Delete only these. */
export async function deletablePaths(access: MediaAccess, filePaths: string[]): Promise<string[]> {
  const keep: string[] = [];
  for (const filePath of filePaths) {
    if ((await access.checkFile(filePath)).ok) keep.push(filePath);
  }
  return keep;
}

/**
 * Every path the app stores for a photoset is a worker output in the photosets folder
 * (`originalPath` is the first output, or empty when there is none). Refuse anything else, so
 * the database never holds a path that a later delete or upload would act on.
 */
export function assertStoredPaths(access: MediaAccess, images: PhotosetAddImagesArgs['images']) {
  const bad: string[] = [];
  for (const image of images) {
    if (image.originalPath !== '' && !access.isInRoots(image.originalPath)) {
      bad.push(image.originalPath);
    }
    for (const output of image.outputs) {
      if (!access.isInRoots(output.imagePath)) bad.push(output.imagePath);
    }
  }
  if (bad.length > 0) throw refused('save', bad);
}
