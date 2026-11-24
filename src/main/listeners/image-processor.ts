import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, utilityProcess } from 'electron';
import baseLog from 'electron-log/main';

import {
  IMAGE_PROCESSOR_CANCEL,
  IMAGE_PROCESSOR_EVENT,
  IMAGE_PROCESSOR_GET_JOB,
  IMAGE_PROCESSOR_RESIZE,
  PHOTOSETS_DIR,
} from '@/common';
import { imageJobIdArgsSchema, imageProcessorResizeArgsSchema } from '@/common/types';
import type { WorkerHandle, WorkerHooks } from '@/main/drivers/image-worker/supervisor';
import { ImageWorkerSupervisor } from '@/main/drivers/image-worker/supervisor';
import { broadcast, handle } from '@/main/ipc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = baseLog.scope('ImageWorkerSupervisor');

let supervisor: ImageWorkerSupervisor | null = null;

function spawnImageWorker({ onMessage, onExit }: WorkerHooks): WorkerHandle {
  // The worker has no `app`, so electron-log can't see the main process's log path.
  // Hand it the resolved file so both processes write to the same per-userData log.
  const child = utilityProcess.fork(path.join(__dirname, './image-processor.js'), [], {
    serviceName: 'Nubes Image Worker',
    env: { ...process.env, NUBES_LOG_FILE: baseLog.transports.file.getFile().path },
  });
  child.on('message', onMessage);
  child.on('exit', onExit);
  // V8 fatal errors arrive as an 'error' event before 'exit'. Without a listener, EventEmitter
  // throws it into main, where the uncaughtException handler below would quit the app.
  child.on('error', (type, location) => log.error(`Image worker ${type} at ${location}`));
  return {
    postMessage: (message) => child.postMessage(message),
    // kill() returns false before the process has spawned. Retry then, or the supervisor would
    // wait forever for an exit that never comes.
    kill: () => {
      if (!child.kill()) child.once('spawn', () => child.kill());
    },
  };
}

/** Dev only: kill the worker as if it crashed. Returns false if no worker is running. */
export function killImageWorker(): boolean {
  return supervisor?.killWorker() ?? false;
}

export function addImageProcessorEventListeners() {
  const imageWorker = new ImageWorkerSupervisor({
    spawn: spawnImageWorker,
    outputFolder: () => path.join(app.getPath('userData'), PHOTOSETS_DIR),
    // Jobs are keyed by ID, so every window can receive every event and keep what it needs.
    onEvent: (event) => broadcast(IMAGE_PROCESSOR_EVENT, event),
    log,
  });
  supervisor = imageWorker;

  handle(IMAGE_PROCESSOR_RESIZE, imageProcessorResizeArgsSchema, (_, { imagePaths }) =>
    imageWorker.submit(imagePaths),
  );

  handle(IMAGE_PROCESSOR_CANCEL, imageJobIdArgsSchema, (_, { jobId }) => {
    imageWorker.cancel(jobId);
  });

  handle(
    IMAGE_PROCESSOR_GET_JOB,
    imageJobIdArgsSchema,
    (_, { jobId }) => imageWorker.getJob(jobId) ?? null,
  );

  app.on('before-quit', () => imageWorker.dispose());

  process.on('uncaughtException', (err) => {
    log.error('Uncaught exception in main, quitting:', err);
    imageWorker.dispose();
    app.quit();
  });
}
