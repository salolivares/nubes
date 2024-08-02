import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrowserWindow } from 'electron';
import { app, ipcMain, MessageChannelMain, utilityProcess } from 'electron';

import {
  IMAGE_PROCESSOR_COMPLETE,
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

  if ('imagePaths' in args && !Array.isArray(args.imagePaths)) {
    throw new Error('Invalid imagePaths');
  }

  if ('folderPaths' in args && !Array.isArray(args.folderPaths)) {
    throw new Error('Invalid folderPaths');
  }
}

export function addImageProcessorEventListeners(mainWindow: BrowserWindow) {
  const { imageProcessor, port1, port2 } = createImageProcessor();

  // Pass along message to image worker process
  ipcMain.handle(IMAGE_PROCESSOR_RESIZE, (_, args) => {
    validateArgs(args);
    imageProcessor.postMessage(
      {
        type: IMAGE_PROCESSOR_RESIZE,
        folderPaths: args.folderPaths,
        imagePaths: args.imagePaths,
        tempFolder: path.join(app.getPath('temp'), 'nubes'),
        dryRun: false,
      },
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

    if (message.data.type === IMAGE_PROCESSOR_COMPLETE) {
      mainWindow.webContents.send(IMAGE_PROCESSOR_COMPLETE, {
        processedImages: message.data.processedImages,
        erroredImagePaths: message.data.erroredImagePaths,
      });
    }
  });
}
