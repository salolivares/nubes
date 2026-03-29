import { ipcRenderer } from 'electron';

import {
  IMAGE_PROCESSOR_COMPLETE,
  IMAGE_PROCESSOR_PROGRESS,
  IMAGE_PROCESSOR_RESIZE,
} from '@/common';
import type { InProgressEvent, ProcessedImage } from '@/common/types';

const resize = (args: { imagePaths: string[] }) => {
  ipcRenderer.send(IMAGE_PROCESSOR_RESIZE, args);
};

const onProgressChange = (
  listener: (event: Electron.IpcRendererEvent, progress: InProgressEvent) => void,
) => {
  const handler = (event: Electron.IpcRendererEvent, progress: InProgressEvent) => {
    listener(event, progress);
  };
  ipcRenderer.on(IMAGE_PROCESSOR_PROGRESS, handler);
  return () => ipcRenderer.off(IMAGE_PROCESSOR_PROGRESS, handler);
};

type ImageProcessorResult = { processedImages: ProcessedImage[]; erroredImagePaths: string[] };

const onComplete = (
  listener: (event: Electron.IpcRendererEvent, result: ImageProcessorResult) => void,
) => {
  const handler = (event: Electron.IpcRendererEvent, result: ImageProcessorResult) =>
    listener(event, result);
  ipcRenderer.on(IMAGE_PROCESSOR_COMPLETE, handler);
  return () => ipcRenderer.off(IMAGE_PROCESSOR_COMPLETE, handler);
};

export const imageProcessor: ImageProcessorContext = {
  resize,
  onProgressChange,
  onComplete,
};
