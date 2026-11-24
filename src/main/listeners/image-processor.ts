import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { WebContents } from 'electron';
import { app, utilityProcess } from 'electron';
import baseLog from 'electron-log/main';

import {
  IMAGE_PROCESSOR_CANCEL,
  IMAGE_PROCESSOR_EVENT,
  IMAGE_PROCESSOR_GET_JOB,
  IMAGE_PROCESSOR_RESIZE,
  PHOTOSETS_DIR,
} from '@/common';
import { isImageJobDone } from '@/common/image-jobs';
import { imageJobIdArgsSchema, imageProcessorResizeArgsSchema } from '@/common/types';
import type { WorkerHandle, WorkerHooks } from '@/main/drivers/image-worker/supervisor';
import { ImageWorkerSupervisor } from '@/main/drivers/image-worker/supervisor';
import { broadcast, handle } from '@/main/ipc';
import { mediaAccess } from '@/main/media';
import { assertResizePaths } from '@/main/media/guards';

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

  // Jobs each window started. A reload wipes the renderer's store, so nothing would ever read
  // those results, and the worker runs one job at a time: cancel them so they don't hold up the
  // next one. Hash-route changes are in-page navigations and don't fire 'did-navigate'.
  const jobsBySender = new WeakMap<WebContents, Set<string>>();
  const trackJob = (sender: WebContents, jobId: string) => {
    let jobs = jobsBySender.get(sender);
    if (!jobs) {
      const owned = new Set<string>();
      const cancelAll = () => {
        for (const id of owned) imageWorker.cancel(id);
        owned.clear();
      };
      sender.on('did-navigate', cancelAll);
      sender.once('destroyed', cancelAll);
      jobsBySender.set(sender, owned);
      jobs = owned;
    }
    for (const id of jobs) {
      const known = imageWorker.getJob(id);
      if (!known || isImageJobDone(known)) jobs.delete(id);
    }
    jobs.add(jobId);
  };

  handle(IMAGE_PROCESSOR_RESIZE, imageProcessorResizeArgsSchema, async (event, { imagePaths }) => {
    // The worker reads whatever it is sent, so the allowlist check happens here.
    await assertResizePaths(mediaAccess, imagePaths);
    const job = imageWorker.submit(imagePaths);
    trackJob(event.sender, job.jobId);
    return job;
  });

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
