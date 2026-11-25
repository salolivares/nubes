import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import type { WebContents } from 'electron';
import { app, utilityProcess } from 'electron';
import baseLog from 'electron-log/main';

import {
  IMAGE_PROCESSOR_CANCEL,
  IMAGE_PROCESSOR_EVENT,
  IMAGE_PROCESSOR_GET_JOB,
  IMAGE_PROCESSOR_RESIZE,
} from '@/common';
import { photosets } from '@/common/db/schema';
import { isImageJobDone } from '@/common/image-jobs';
import { imageJobIdArgsSchema, imageProcessorResizeArgsSchema } from '@/common/types';
import { Database } from '@/main/drivers/database';
import type { WorkerHandle, WorkerHooks } from '@/main/drivers/image-worker/supervisor';
import { ImageWorkerSupervisor } from '@/main/drivers/image-worker/supervisor';
import { broadcast, handle } from '@/main/ipc';
import { mediaAccess } from '@/main/media';
import { assertResizePaths } from '@/main/media/guards';
import { photosetOutputFolder, photosetsRoot } from '@/main/photoset-folders';

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

/**
 * Cancel a photoset's image jobs and resolve once none of them can write to its folder. Deleting a
 * photoset calls this first, so a job left running in the background can't recreate the folder.
 */
export function stopPhotosetJobs(photosetId: number): Promise<void> {
  return (
    supervisor?.cancelFolder(photosetOutputFolder(photosetsRoot(), photosetId)) ?? Promise.resolve()
  );
}

/** Dev only: kill the worker as if it crashed. Returns false if no worker is running. */
export function killImageWorker(): boolean {
  return supervisor?.killWorker() ?? false;
}

export function addImageProcessorEventListeners() {
  const imageWorker = new ImageWorkerSupervisor({
    spawn: spawnImageWorker,
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

  handle(
    IMAGE_PROCESSOR_RESIZE,
    imageProcessorResizeArgsSchema,
    async (event, { photosetId, imagePaths }) => {
      // The worker reads whatever it is sent, so the allowlist check happens here.
      await assertResizePaths(mediaAccess, imagePaths);
      // Only write into a folder for a photoset that exists, so a bad id can't make stray folders.
      const exists = Database.instance.db
        .select({ id: photosets.id })
        .from(photosets)
        .where(eq(photosets.id, photosetId))
        .get();
      if (!exists) throw new Error(`Photoset ${photosetId} not found`);

      const outputFolder = photosetOutputFolder(photosetsRoot(), photosetId);
      const job = imageWorker.submit(imagePaths, outputFolder);
      trackJob(event.sender, job.jobId);
      return job;
    },
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
