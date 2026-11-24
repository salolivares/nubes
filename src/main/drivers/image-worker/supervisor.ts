import { randomUUID } from 'node:crypto';

import { applyImageJobEvent, createImageJob, isImageJobDone } from '@/common/image-jobs';
import type { ImageJob, ImageJobEvent, ImageWorkerRequest } from '@/common/types';
import { imageWorkerEventSchema } from '@/common/types';

export interface WorkerHooks {
  onMessage: (data: unknown) => void;
  onExit: (code: number) => void;
}

export interface WorkerHandle {
  postMessage: (message: ImageWorkerRequest) => void;
  kill: () => void;
}

export interface SupervisorLog {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface ImageWorkerSupervisorOptions {
  /** Start a worker process. The supervisor calls this lazily, at most one live worker at a time. */
  spawn: (hooks: WorkerHooks) => WorkerHandle;
  outputFolder: () => string;
  onEvent: (event: ImageJobEvent) => void;
  createJobId?: () => string;
  /** How long a running job gets to stop after a cancel before the worker is killed. */
  cancelGraceMs?: number;
  /** How many finished jobs to keep for getJob(). */
  maxFinishedJobs?: number;
  log?: SupervisorLog;
}

const DEFAULT_CANCEL_GRACE_MS = 15_000;
const DEFAULT_MAX_FINISHED_JOBS = 20;

/**
 * Owns the image worker and the job queue.
 *
 * - Jobs are sent to the worker one at a time. The next one goes out when the current one
 *   completes.
 * - If the worker exits, the job in flight fails (or counts as cancelled, if a cancel killed it)
 *   and the next queued job forks a fresh worker.
 * - A worker is only forgotten once it has actually exited, so two never run at once.
 */
export class ImageWorkerSupervisor {
  private readonly jobs = new Map<string, ImageJob>();
  private readonly queue: string[] = [];
  private worker: WorkerHandle | null = null;
  /** True between asking the worker to die and its exit event. */
  private workerStopping = false;
  private currentJobId: string | null = null;
  private cancelRequested = false;
  private cancelTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private readonly createJobId: () => string;
  private readonly cancelGraceMs: number;
  private readonly maxFinishedJobs: number;
  private readonly log: SupervisorLog;

  constructor(private readonly options: ImageWorkerSupervisorOptions) {
    this.createJobId = options.createJobId ?? randomUUID;
    this.cancelGraceMs = options.cancelGraceMs ?? DEFAULT_CANCEL_GRACE_MS;
    this.maxFinishedJobs = options.maxFinishedJobs ?? DEFAULT_MAX_FINISHED_JOBS;
    this.log = options.log ?? console;
  }

  submit(imagePaths: string[]): ImageJob {
    const job = createImageJob(this.createJobId(), imagePaths);
    this.jobs.set(job.jobId, job);
    if (this.disposed) {
      this.emit({ type: 'failed', jobId: job.jobId, error: 'The app is shutting down.' });
      return this.jobs.get(job.jobId) ?? job;
    }
    this.queue.push(job.jobId);
    this.pruneFinishedJobs();
    this.dispatchNext();
    // Return the latest snapshot. Any 'started' event already went out before this reply, so the
    // renderer can overwrite its copy with this without going backwards.
    return this.jobs.get(job.jobId) ?? job;
  }

  getJob(jobId: string): ImageJob | undefined {
    return this.jobs.get(jobId);
  }

  cancel(jobId: string): void {
    const queuedIndex = this.queue.indexOf(jobId);
    if (queuedIndex !== -1) {
      this.queue.splice(queuedIndex, 1);
      this.emit({
        type: 'complete',
        jobId,
        processedImages: [],
        erroredImages: [],
        cancelled: true,
      });
      return;
    }

    // A dying worker can't cancel anything, and its exit already settles the job.
    if (
      jobId !== this.currentJobId ||
      this.cancelRequested ||
      !this.worker ||
      this.workerStopping
    ) {
      return;
    }

    this.cancelRequested = true;
    this.worker.postMessage({ type: 'cancel', jobId });
    // Killing the worker is the hard stop if it doesn't wind down in time.
    this.cancelTimer = setTimeout(() => {
      this.log.warn(`Job ${jobId} ignored cancel for ${this.cancelGraceMs}ms, killing worker`);
      this.stopWorker();
    }, this.cancelGraceMs);
  }

  /** Kill the worker as if it crashed. The job in flight fails. Returns false if none is running. */
  killWorker(): boolean {
    if (!this.worker) return false;
    this.stopWorker();
    return true;
  }

  /** Stop for good: kill the worker, fail every unfinished job, and never fork again. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopWorker();
    for (const jobId of [...this.queue, ...(this.currentJobId ? [this.currentJobId] : [])]) {
      this.emit({ type: 'failed', jobId, error: 'The app is shutting down.' });
    }
    this.queue.length = 0;
    this.finishCurrentJob();
  }

  private dispatchNext(): void {
    // A worker that was told to die keeps its slot until it exits. Its exit handler calls back in.
    if (this.disposed || this.workerStopping || this.currentJobId) return;
    const jobId = this.queue.shift();
    if (!jobId) return;

    const job = this.jobs.get(jobId);
    if (!job) return this.dispatchNext();

    const worker = this.worker ?? this.spawnWorker();
    this.currentJobId = jobId;
    worker.postMessage({
      type: 'resize',
      jobId,
      imagePaths: job.imagePaths,
      outputFolder: this.options.outputFolder(),
    });
    this.emit({ type: 'started', jobId });
  }

  private spawnWorker(): WorkerHandle {
    const worker = this.options.spawn({
      onMessage: (data) => this.handleMessage(worker, data),
      onExit: (code) => this.handleExit(worker, code),
    });
    this.worker = worker;
    this.log.info('Image worker started');
    return worker;
  }

  private handleMessage(worker: WorkerHandle, data: unknown): void {
    if (worker !== this.worker) return;

    const parsed = imageWorkerEventSchema.safeParse(data);
    if (!parsed.success) {
      this.log.error('Invalid message from image worker:', parsed.error.message);
      // The worker and main disagree on the protocol, so neither can trust where the job is.
      // Fail it and restart the worker instead of waiting for a completion that won't parse.
      if (this.currentJobId) {
        this.emit({
          type: 'failed',
          jobId: this.currentJobId,
          error: 'The image worker sent a message Nubes could not read. Try again.',
        });
        this.finishCurrentJob();
        this.stopWorker();
      }
      return;
    }

    const event = parsed.data;
    if (event.jobId !== this.currentJobId) {
      this.log.warn(`Dropping ${event.type} for job ${event.jobId}, which is not in flight`);
      return;
    }

    this.emit(event);
    if (event.type === 'complete') {
      this.finishCurrentJob();
      this.dispatchNext();
    }
  }

  private handleExit(worker: WorkerHandle, code: number): void {
    if (worker !== this.worker) return;
    this.worker = null;
    this.workerStopping = false;
    this.log.warn(`Image worker exited with code ${code}`);

    const jobId = this.currentJobId;
    if (jobId) {
      const job = this.jobs.get(jobId);
      if (this.cancelRequested) {
        this.emit({
          type: 'complete',
          jobId,
          processedImages: job?.processedImages ?? [],
          erroredImages: job?.erroredImages ?? [],
          cancelled: true,
        });
      } else {
        this.emit({
          type: 'failed',
          jobId,
          // Not the exit code: kill() reports 0 on macOS, which reads like success.
          error: 'The image worker stopped unexpectedly. Try again.',
        });
      }
      this.finishCurrentJob();
    }

    this.dispatchNext();
  }

  private stopWorker(): void {
    if (!this.worker) return;
    this.workerStopping = true;
    this.worker.kill();
  }

  private finishCurrentJob(): void {
    if (this.cancelTimer) clearTimeout(this.cancelTimer);
    this.cancelTimer = null;
    this.cancelRequested = false;
    this.currentJobId = null;
  }

  private emit(event: ImageJobEvent): void {
    this.jobs.set(event.jobId, applyImageJobEvent(this.jobs.get(event.jobId), event));
    this.options.onEvent(event);
  }

  private pruneFinishedJobs(): void {
    const finished = [...this.jobs.values()].filter(isImageJobDone);
    for (const job of finished.slice(0, Math.max(0, finished.length - this.maxFinishedJobs))) {
      this.jobs.delete(job.jobId);
    }
  }
}
