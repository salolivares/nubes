import { ipcRenderer } from 'electron';

import { IMAGE_PICKER_OPEN, IMAGE_PICKER_READ_PREVIEW, IMAGE_PICKER_READ_THUMBNAIL } from '@/common';

const open = () => ipcRenderer.invoke(IMAGE_PICKER_OPEN) as Promise<ImagePickerFile[]>;
const readThumbnail = (filePath: string) =>
  ipcRenderer.invoke(IMAGE_PICKER_READ_THUMBNAIL, filePath) as Promise<string>;
const readPreview = (filePath: string) =>
  ipcRenderer.invoke(IMAGE_PICKER_READ_PREVIEW, filePath) as Promise<string>;

export const imagePicker: ImagePickerContext = {
  open,
  readThumbnail,
  readPreview,
};
