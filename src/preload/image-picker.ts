import { ipcRenderer } from 'electron';

import { IMAGE_PICKER_OPEN } from '@/common';

const open = () => ipcRenderer.invoke(IMAGE_PICKER_OPEN) as Promise<ImagePickerFile[]>;

export const imagePicker: ImagePickerContext = {
  open,
};
