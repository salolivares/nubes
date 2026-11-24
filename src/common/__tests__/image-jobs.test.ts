import { describe, expect, it } from 'vitest';

import {
  applyImageJobEvent,
  createImageJob,
  isImageJobBehind,
  isImageJobDone,
} from '@/common/image-jobs';
import type { ProcessedImage } from '@/common/types';
import { imageJobEventSchema, imageWorkerEventSchema } from '@/common/types';

const processed: ProcessedImage = { id: 'a_1x1_jpeg_0', name: 'a', imagePaths: [] };

describe('applyImageJobEvent', () => {
  it('moves a queued job to running on start', () => {
    const job = applyImageJobEvent(createImageJob('j1', ['/a.jpg']), {
      type: 'started',
      jobId: 'j1',
    });
    expect(job.status).toBe('running');
  });

  it('records finished and errored paths from progress', () => {
    let job = createImageJob('j1', ['/a.jpg', '/b.jpg']);
    job = applyImageJobEvent(job, {
      type: 'progress',
      jobId: 'j1',
      current: 1,
      total: 2,
      path: '/a.jpg',
      name: 'a.jpg',
    });
    job = applyImageJobEvent(job, {
      type: 'progress',
      jobId: 'j1',
      current: 2,
      total: 2,
      path: '/b.jpg',
      name: 'b.jpg',
      error: 'bad header',
    });
    expect(job.donePaths).toEqual(['/a.jpg', '/b.jpg']);
    expect(job.erroredImages).toEqual([{ path: '/b.jpg', error: 'bad header' }]);
  });

  it('marks a cancelled completion as cancelled', () => {
    const job = applyImageJobEvent(createImageJob('j1', []), {
      type: 'complete',
      jobId: 'j1',
      processedImages: [processed],
      erroredImages: [],
      cancelled: true,
    });
    expect(job.status).toBe('cancelled');
    expect(job.processedImages).toEqual([processed]);
  });

  it('ignores events once the job is done', () => {
    const failed = applyImageJobEvent(createImageJob('j1', []), {
      type: 'failed',
      jobId: 'j1',
      error: 'worker exited',
    });
    const after = applyImageJobEvent(failed, {
      type: 'complete',
      jobId: 'j1',
      processedImages: [processed],
      erroredImages: [],
      cancelled: false,
    });
    expect(after).toBe(failed);
    expect(isImageJobDone(after)).toBe(true);
  });

  it('creates a job from an event it has not seen', () => {
    const job = applyImageJobEvent(undefined, { type: 'started', jobId: 'j9' });
    expect(job).toMatchObject({ jobId: 'j9', status: 'running' });
  });
});

describe('isImageJobBehind', () => {
  const queued = createImageJob('j1', ['/a.jpg', '/b.jpg']);
  const running = { ...queued, status: 'running' as const };
  const halfway = { ...running, donePaths: ['/a.jpg'] };
  const complete = { ...halfway, status: 'complete' as const };

  it('orders snapshots by status, then by finished images', () => {
    expect(isImageJobBehind(queued, running)).toBe(true);
    expect(isImageJobBehind(running, halfway)).toBe(true);
    expect(isImageJobBehind(halfway, complete)).toBe(true);
    expect(isImageJobBehind(complete, halfway)).toBe(false);
    expect(isImageJobBehind(halfway, halfway)).toBe(false);
  });
});

describe('image worker schemas', () => {
  it('rejects error entries sent as plain strings (#97)', () => {
    const result = imageWorkerEventSchema.safeParse({
      type: 'complete',
      jobId: 'j1',
      processedImages: [],
      erroredImages: ['/a.jpg'],
      cancelled: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects messages without a jobId', () => {
    expect(
      imageJobEventSchema.safeParse({ type: 'progress', current: 1, total: 1, path: '', name: '' })
        .success,
    ).toBe(false);
  });
});
