import { create } from 'zustand';

import { applyImageJobEvent, isImageJobBehind, isImageJobDone } from '@/common/image-jobs';
import type { ImageJob, ImageJobEvent } from '@/common/types';

interface ImageJobState {
  /** Image processing jobs, keyed by jobId. */
  jobs: Record<string, ImageJob>;
}

interface ImageJobActions {
  applyEvent: (event: ImageJobEvent) => void;
  /** Store a snapshot from main, unless events already moved our copy further along. */
  upsertJob: (job: ImageJob) => void;
  /** Start a job whose outputs belong to `photosetId`. Main writes them to its own folder. */
  start: (photosetId: number, imagePaths: string[]) => Promise<ImageJob>;
  /**
   * Start a job and resolve once it is complete, cancelled or failed. `onStart` gets the jobId as
   * soon as main accepts the job, so a caller can show live progress from `jobs[jobId]`.
   */
  run: (
    photosetId: number,
    imagePaths: string[],
    onStart?: (jobId: string) => void,
  ) => Promise<ImageJob>;
  cancel: (jobId: string) => Promise<void>;
  /** Catch up on a job after a remount, in case events went by while nothing was looking. */
  refresh: (jobId: string) => Promise<void>;
}

const MAX_FINISHED_JOBS = 20;

/** Drop the oldest finished jobs. Results can hold base64 previews, so don't keep them forever. */
function pruneFinished(jobs: Record<string, ImageJob>): Record<string, ImageJob> {
  const finished = Object.values(jobs).filter(isImageJobDone);
  if (finished.length <= MAX_FINISHED_JOBS) return jobs;
  const pruned = { ...jobs };
  for (const job of finished.slice(0, finished.length - MAX_FINISHED_JOBS)) {
    delete pruned[job.jobId];
  }
  return pruned;
}

let unsubscribe: (() => void) | null = null;

/** Listen for job events once for the whole app, not once per component. */
function ensureSubscribed() {
  if (unsubscribe) return;
  unsubscribe = window.imageProcessor.onEvent((event) =>
    useImageJobStore.getState().applyEvent(event),
  );
}

/** Resolve with the job once it reaches a final status. Main always sends one, even on a crash. */
function waitForJob(jobId: string): Promise<ImageJob> {
  return new Promise((resolve) => {
    const settle = (job: ImageJob | undefined) => {
      if (!job || !isImageJobDone(job)) return;
      unsubscribe();
      resolve(job);
    };
    const unsubscribe = useImageJobStore.subscribe((state) => settle(state.jobs[jobId]));
    settle(useImageJobStore.getState().jobs[jobId]);
  });
}

export const useImageJobStore = create<ImageJobState & ImageJobActions>()((set, get) => ({
  jobs: {},
  applyEvent: (event) =>
    set((state) => ({
      jobs: pruneFinished({
        ...state.jobs,
        [event.jobId]: applyImageJobEvent(state.jobs[event.jobId], event),
      }),
    })),
  upsertJob: (job) =>
    set((state) => {
      const existing = state.jobs[job.jobId];
      if (existing && isImageJobBehind(job, existing)) {
        // Events got here first. Keep them, but a job created from an event has no imagePaths.
        if (existing.imagePaths.length > 0) return state;
        return {
          jobs: { ...state.jobs, [job.jobId]: { ...existing, imagePaths: job.imagePaths } },
        };
      }
      return { jobs: pruneFinished({ ...state.jobs, [job.jobId]: job }) };
    }),
  start: async (photosetId, imagePaths) => {
    ensureSubscribed();
    const job = await window.imageProcessor.resize({ photosetId, imagePaths });
    get().upsertJob(job);
    return job;
  },
  run: async (photosetId, imagePaths, onStart) => {
    const job = await get().start(photosetId, imagePaths);
    onStart?.(job.jobId);
    return waitForJob(job.jobId);
  },
  cancel: (jobId) => window.imageProcessor.cancel(jobId),
  refresh: async (jobId) => {
    ensureSubscribed();
    const job = await window.imageProcessor.getJob(jobId);
    if (job) get().upsertJob(job);
  },
}));
