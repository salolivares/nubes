import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrowserWindow } from 'electron';
import { app, MessageChannelMain, utilityProcess } from 'electron';
import { z } from 'zod';

import {
  IMAGE_PROCESSOR_COMPLETE,
  IMAGE_PROCESSOR_PROGRESS,
  IMAGE_PROCESSOR_RESIZE,
  PHOTOSETS_DIR,
} from '@/common';
import { on } from '@/main/ipc';

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

const argsSchema = z.object({
  imagePaths: z.array(z.string()).optional(),
  folderPaths: z.array(z.string()).optional(),
});

export function addImageProcessorEventListeners(mainWindow: BrowserWindow) {
  const { imageProcessor, port1, port2 } = createImageProcessor();

  // Transfer port2 to the worker once at startup
  imageProcessor.postMessage({ type: 'init' }, [port2]);

  // Pass along message to image worker process via port1
  on(IMAGE_PROCESSOR_RESIZE, argsSchema, (_, args) => {
    port1.postMessage({
      type: IMAGE_PROCESSOR_RESIZE,
      folderPaths: args.folderPaths,
      imagePaths: args.imagePaths,
      tempFolder: path.join(app.getPath('userData'), PHOTOSETS_DIR),
      dryRun: false,
    });
  });

  // send progress updates back to renderer
  port1.on('message', (message) => {
    if (message.data.type === IMAGE_PROCESSOR_PROGRESS) {
      mainWindow.webContents.send(IMAGE_PROCESSOR_PROGRESS, {
        current: message.data.current,
        total: message.data.total,
        path: message.data.path,
        name: message.data.name,
        id: message.data.id,
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
