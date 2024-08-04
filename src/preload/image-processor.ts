import { ipcRenderer } from 'electron';

import {
  IMAGE_PROCESSOR_COMPLETE,
  IMAGE_PROCESSOR_PROGRESS,
  IMAGE_PROCESSOR_RESIZE,
} from '@/common';

const resize = (imagePaths: string[]) => {
  // TODO(sal): this should be .send but it's not working
  ipcRenderer.invoke(IMAGE_PROCESSOR_RESIZE, { imagePaths });
};

const onProgressChange = (listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => {
  const handler = (event: Electron.IpcRendererEvent, ...args: any[]) => {
    listener(event, ...args);
  };
  ipcRenderer.on(IMAGE_PROCESSOR_PROGRESS, handler);
  return () => ipcRenderer.off(IMAGE_PROCESSOR_PROGRESS, handler);
};

const onComplete = (listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => {
  const handler = (event: Electron.IpcRendererEvent, ...args: any[]) => listener(event, ...args);
  ipcRenderer.on(IMAGE_PROCESSOR_COMPLETE, handler);
  return () => ipcRenderer.off(IMAGE_PROCESSOR_COMPLETE, handler);
};

export const imageProcessor: ImageProcessorContext = {
  resize,
  onProgressChange,
  onComplete,
};
