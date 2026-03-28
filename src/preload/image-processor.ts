import { ipcRenderer } from 'electron';

import {
  IMAGE_PROCESSOR_COMPLETE,
  IMAGE_PROCESSOR_PROGRESS,
  IMAGE_PROCESSOR_RESIZE,
} from '@/common';

const resize = (args: { imagePaths: string[] }) => {
  ipcRenderer.send(IMAGE_PROCESSOR_RESIZE, args);
};

const onProgressChange = (
  listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void,
) => {
  const handler = (event: Electron.IpcRendererEvent, ...args: unknown[]) => {
    listener(event, ...args);
  };
  ipcRenderer.on(IMAGE_PROCESSOR_PROGRESS, handler);
  return () => ipcRenderer.off(IMAGE_PROCESSOR_PROGRESS, handler);
};

const onComplete = (listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void) => {
  const handler = (event: Electron.IpcRendererEvent, ...args: unknown[]) =>
    listener(event, ...args);
  ipcRenderer.on(IMAGE_PROCESSOR_COMPLETE, handler);
  return () => ipcRenderer.off(IMAGE_PROCESSOR_COMPLETE, handler);
};

export const imageProcessor: ImageProcessorContext = {
  resize,
  onProgressChange,
  onComplete,
};
