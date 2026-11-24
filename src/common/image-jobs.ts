import type { ImageJob, ImageJobEvent, ImageJobStatus } from './types';

const TERMINAL_STATUSES: ReadonlySet<ImageJobStatus> = new Set(['complete', 'cancelled', 'failed']);

export function isImageJobDone(job: Pick<ImageJob, 'status'>): boolean {
  return TERMINAL_STATUSES.has(job.status);
}

const STATUS_RANK: Record<ImageJobStatus, number> = {
  queued: 0,
  running: 1,
  complete: 2,
  cancelled: 2,
  failed: 2,
};

/**
 * True if `a` is an older view of the job than `b`. Jobs only move forward, so a snapshot that
 * arrives after newer events (say, a slow invoke reply) must not replace them.
 */
export function isImageJobBehind(a: ImageJob, b: ImageJob): boolean {
  const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (byStatus !== 0) return byStatus < 0;
  return a.donePaths.length < b.donePaths.length;
}

export function createImageJob(jobId: string, imagePaths: string[]): ImageJob {
  return {
    jobId,
    status: 'queued',
    imagePaths,
    donePaths: [],
    processedImages: [],
    erroredImages: [],
    error: null,
  };
}

/**
 * Fold one event into a job snapshot. Main keeps its job registry with this, and the renderer
 * applies the same events to its copy, so both sides agree on what a job looks like.
 *
 * Events for a job that already finished are ignored, so a late message can't revive it.
 */
export function applyImageJobEvent(job: ImageJob | undefined, event: ImageJobEvent): ImageJob {
  const current = job ?? createImageJob(event.jobId, []);
  if (isImageJobDone(current)) return current;

  switch (event.type) {
    case 'started':
      return { ...current, status: 'running' };
    case 'progress':
      return {
        ...current,
        status: 'running',
        donePaths: current.donePaths.includes(event.path)
          ? current.donePaths
          : [...current.donePaths, event.path],
        erroredImages:
          event.error === undefined
            ? current.erroredImages
            : [...current.erroredImages, { path: event.path, error: event.error }],
      };
    case 'complete':
      return {
        ...current,
        status: event.cancelled ? 'cancelled' : 'complete',
        processedImages: event.processedImages,
        erroredImages: event.erroredImages,
      };
    case 'failed':
      return { ...current, status: 'failed', error: event.error };
  }
}
