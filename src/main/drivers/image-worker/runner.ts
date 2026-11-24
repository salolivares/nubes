import path from 'node:path';

import type {
  ImageError,
  ImageWorkerEvent,
  ImageWorkerRequest,
  ProcessedImage,
} from '@/common/types';

type ResizeRequest = Extract<ImageWorkerRequest, { type: 'resize' }>;

export interface JobRunnerDeps {
  processImage: (imagePath: string, outputFolder: string) => Promise<ProcessedImage>;
  post: (event: ImageWorkerEvent) => void;
  log?: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

/**
 * Runs resize jobs inside the worker, one at a time and in the order they arrive. A cancel sets a
 * flag that is checked between images, so the image in progress always finishes.
 */
export function createJobRunner({ processImage, post, log }: JobRunnerDeps) {
  let queue: Promise<void> = Promise.resolve();
  const pending = new Set<string>();
  const cancelled = new Set<string>();

  async function run({ jobId, imagePaths, outputFolder }: ResizeRequest) {
    log?.info(`Job ${jobId} started: ${imagePaths.length} image(s)`);
    const processedImages: ProcessedImage[] = [];
    const erroredImages: ImageError[] = [];

    for (const [i, imagePath] of imagePaths.entries()) {
      if (cancelled.has(jobId)) break;

      let error: string | undefined;
      try {
        processedImages.push(await processImage(imagePath, outputFolder));
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        log?.error(`Error processing ${imagePath}: ${error}`);
        erroredImages.push({ path: imagePath, error });
      }

      post({
        type: 'progress',
        jobId,
        current: i + 1,
        total: imagePaths.length,
        path: imagePath,
        name: path.basename(imagePath),
        ...(error === undefined ? {} : { error }),
      });
    }

    const wasCancelled = cancelled.has(jobId);
    pending.delete(jobId);
    cancelled.delete(jobId);
    log?.info(
      `Job ${jobId} ${wasCancelled ? 'cancelled' : 'complete'}: ` +
        `${processedImages.length} succeeded, ${erroredImages.length} failed`,
    );
    post({ type: 'complete', jobId, processedImages, erroredImages, cancelled: wasCancelled });
  }

  return {
    handle(request: ImageWorkerRequest): Promise<void> {
      if (request.type === 'cancel') {
        if (pending.has(request.jobId)) cancelled.add(request.jobId);
        return queue;
      }
      pending.add(request.jobId);
      // Catch so one broken job can't stall every job queued behind it.
      queue = queue
        .then(() => run(request))
        .catch((err) => log?.error(`Job ${request.jobId} crashed:`, err));
      return queue;
    },
  };
}
