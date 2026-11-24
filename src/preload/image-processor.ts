import { ipcRenderer } from 'electron';

import {
  IMAGE_PROCESSOR_CANCEL,
  IMAGE_PROCESSOR_EVENT,
  IMAGE_PROCESSOR_GET_JOB,
  IMAGE_PROCESSOR_RESIZE,
} from '@/common';
import type { ImageJob, ImageJobEvent, ImageProcessorResizeArgs } from '@/common/types';

const resize = (args: ImageProcessorResizeArgs) =>
  ipcRenderer.invoke(IMAGE_PROCESSOR_RESIZE, args) as Promise<ImageJob>;

const cancel = (jobId: string) =>
  ipcRenderer.invoke(IMAGE_PROCESSOR_CANCEL, { jobId }) as Promise<void>;

const getJob = (jobId: string) =>
  ipcRenderer.invoke(IMAGE_PROCESSOR_GET_JOB, { jobId }) as Promise<ImageJob | null>;

const onEvent = (listener: (event: ImageJobEvent) => void) => {
  const handler = (_: Electron.IpcRendererEvent, event: ImageJobEvent) => listener(event);
  ipcRenderer.on(IMAGE_PROCESSOR_EVENT, handler);
  return () => {
    ipcRenderer.off(IMAGE_PROCESSOR_EVENT, handler);
  };
};

export const imageProcessor: ImageProcessorContext = {
  resize,
  cancel,
  getJob,
  onEvent,
};
