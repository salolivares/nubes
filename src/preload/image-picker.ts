import { ipcRenderer, webUtils } from 'electron';

import { IMAGE_PICKER_ALLOW_DROPPED, IMAGE_PICKER_OPEN } from '@/common';
import { resolveDroppedFiles, toDroppedFileList } from '@/common/dropped-files';
import type { DroppedFiles } from '@/common/types';

const open = () => ipcRenderer.invoke(IMAGE_PICKER_OPEN) as Promise<ImagePickerFile[]>;

const getPathForFile = (file: File) => {
  try {
    return webUtils.getPathForFile(file);
  } catch {
    return '';
  }
};

/**
 * Takes the File objects from a drop, not paths, so page code can only offer files the user
 * actually dropped. Paths are looked up here and sent to main, which adds them to the
 * `nubes-media://` allowlist.
 */
const addDroppedFiles = async (files: unknown): Promise<DroppedFiles> =>
  resolveDroppedFiles(
    toDroppedFileList(files),
    getPathForFile,
    (paths) => ipcRenderer.invoke(IMAGE_PICKER_ALLOW_DROPPED, paths) as Promise<string[]>,
  );

export const imagePicker: ImagePickerContext = {
  open,
  addDroppedFiles,
};
