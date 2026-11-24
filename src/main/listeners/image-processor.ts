import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { WebContents } from 'electron';
import { app, MessageChannelMain, utilityProcess } from 'electron';
import baseLog from 'electron-log/main';

import {
  IMAGE_PROCESSOR_COMPLETE,
  IMAGE_PROCESSOR_PROGRESS,
  IMAGE_PROCESSOR_RESIZE,
  PHOTOSETS_DIR,
} from '@/common';
import { imageProcessorResizeArgsSchema } from '@/common/types';
import { on } from '@/main/ipc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createImageProcessor() {
  const { port1, port2 } = new MessageChannelMain();
  port1.start();
  port2.start();

  // The worker has no `app`, so electron-log can't see the main process's log path.
  // Hand it the resolved file so both processes write to the same per-userData log.
  const imageProcessor = utilityProcess.fork(path.join(__dirname, './image-processor.js'), [], {
    env: { ...process.env, NUBES_LOG_FILE: baseLog.transports.file.getFile().path },
  });

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

export function addImageProcessorEventListeners() {
  const { imageProcessor, port1, port2 } = createImageProcessor();

  // The window that sent the last resize request. Progress goes back to it, not
  // to a window captured at startup, which may have been closed since.
  let requester: WebContents | null = null;
  const reply = (channel: string, payload: unknown) => {
    if (requester && !requester.isDestroyed()) {
      requester.send(channel, payload);
    }
  };

  // Transfer port2 to the worker once at startup
  imageProcessor.postMessage({ type: 'init' }, [port2]);

  // Pass along message to image worker process via port1
  on(IMAGE_PROCESSOR_RESIZE, imageProcessorResizeArgsSchema, (event, args) => {
    requester = event.sender;
    port1.postMessage({
      type: IMAGE_PROCESSOR_RESIZE,
      imagePaths: args.imagePaths,
      tempFolder: path.join(app.getPath('userData'), PHOTOSETS_DIR),
      dryRun: false,
    });
  });

  // send progress updates back to renderer
  port1.on('message', (message) => {
    if (message.data.type === IMAGE_PROCESSOR_PROGRESS) {
      reply(IMAGE_PROCESSOR_PROGRESS, {
        current: message.data.current,
        total: message.data.total,
        path: message.data.path,
        name: message.data.name,
        id: message.data.id,
      });
    }

    if (message.data.type === IMAGE_PROCESSOR_COMPLETE) {
      reply(IMAGE_PROCESSOR_COMPLETE, {
        processedImages: message.data.processedImages,
        erroredImagePaths: message.data.erroredImagePaths,
      });
    }
  });
}
