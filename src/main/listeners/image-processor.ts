import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrowserWindow } from 'electron';
import { app, ipcMain, MessageChannelMain, utilityProcess } from 'electron';

import {
  IMAGE_PROCESSOR_CHANNEL,
  IMAGE_PROCESSOR_PROGRESS,
  IMAGE_PROCESSOR_RESIZE,
} from '@/common';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createImageProcessor() {
  const { port1, port2 } = new MessageChannelMain();
  port1.start();
  port2.start();

  const imageProcessor = utilityProcess.fork(path.join(__dirname, './image-processor.js'));

  app.on('before-quit', () => {
    if (imageProcessor.kill()) {
      console.log('imageProcessor killed');
    }
  });

  app.on('will-quit', () => {
    if (imageProcessor.kill()) {
      console.log('imageProcessor killed');
    }
  });

  process.on('uncaughtException', () => {
    if (imageProcessor.kill()) {
      console.log('Killing image processor due to uncaught exception');
    }
    app.quit();
  });

  return {
    imageProcessor,
    port1,
    port2,
  };
}

type Args = {
  imagePaths?: string[];
  folderPaths?: string[];
};

function validateArgs(args: unknown): asserts args is Args {
  if (!args || typeof args !== 'object') {
    throw new Error('Invalid arguments');
  }

  const { imagePaths, folderPaths } = args as Record<string, unknown>;

  if (!Array.isArray(imagePaths) || !Array.isArray(folderPaths)) {
    throw new Error('Invalid arguments');
  }
}

export function addImageProcessorEventListeners(mainWindow: BrowserWindow) {
  const { imageProcessor, port1, port2 } = createImageProcessor();

  // Pass along message to image worker process
  ipcMain.handle(IMAGE_PROCESSOR_RESIZE, (_, args) => {
    validateArgs(args);
    imageProcessor.postMessage(
      { type: IMAGE_PROCESSOR_RESIZE, folderPaths: args.folderPaths, imagePaths: args.imagePaths },
      [port2]
    );
  });

  // send progress updates back to renderer
  port1.on('message', (message) => {
    if (message.data.type === IMAGE_PROCESSOR_PROGRESS) {
      mainWindow.webContents.send(IMAGE_PROCESSOR_PROGRESS, {
        current: message.data.current,
        total: message.data.total,
        path: message.data.path,
      });
    }
  });

  imageProcessor.postMessage(
    { type: IMAGE_PROCESSOR_RESIZE, imagePaths: ['/Users/sal/dev/nubes/test.png'] },
    [port2]
  );
}
