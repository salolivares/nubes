import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createImageJob } from '@/common/image-jobs';
import type { ImageJobEvent } from '@/common/types';

import { useImageJobStore } from '../image-jobs';

let emit: (event: ImageJobEvent) => void = () => {};

describe('useImageJobStore', () => {
  beforeEach(() => {
    useImageJobStore.setState({ jobs: {} });
    vi.mocked(window.imageProcessor.onEvent).mockImplementation((listener) => {
      emit = listener;
      return () => {};
    });
    vi.mocked(window.imageProcessor.resize).mockResolvedValue(
      createImageJob('job-1', ['/a.jpg', '/b.jpg']),
    );
  });

  it('subscribes to worker events only once', async () => {
    const { start } = useImageJobStore.getState();
    await start(['/a.jpg']);
    await start(['/b.jpg']);

    expect(window.imageProcessor.onEvent).toHaveBeenCalledTimes(1);
  });

  it('applies events to the right job, even two in a row', async () => {
    const job = await useImageJobStore.getState().start(['/a.jpg', '/b.jpg']);
    useImageJobStore.getState().upsertJob(createImageJob('job-2', ['/c.jpg']));

    emit({ type: 'started', jobId: job.jobId });
    emit({ type: 'progress', jobId: 'job-1', current: 1, total: 2, path: '/a.jpg', name: 'a.jpg' });
    emit({ type: 'progress', jobId: 'job-1', current: 2, total: 2, path: '/b.jpg', name: 'b.jpg' });

    const { jobs } = useImageJobStore.getState();
    expect(jobs['job-1'].donePaths).toEqual(['/a.jpg', '/b.jpg']);
    expect(jobs['job-2'].donePaths).toEqual([]);
  });

  it('shows a worker crash as a failed job', async () => {
    await useImageJobStore.getState().start(['/a.jpg']);
    emit({ type: 'failed', jobId: 'job-1', error: 'The image worker exited unexpectedly' });

    expect(useImageJobStore.getState().jobs['job-1']).toMatchObject({
      status: 'failed',
      error: 'The image worker exited unexpectedly',
    });
  });

  it('run() resolves with the finished job and reports the jobId when it starts', async () => {
    const onStart = vi.fn();
    const done = useImageJobStore.getState().run(['/a.jpg', '/b.jpg'], onStart);
    await vi.waitFor(() => expect(onStart).toHaveBeenCalledWith('job-1'));

    let settled = false;
    void done.then(() => (settled = true));
    emit({ type: 'progress', jobId: 'job-1', current: 1, total: 2, path: '/a.jpg', name: 'a.jpg' });
    await Promise.resolve();
    expect(settled).toBe(false);

    emit({
      type: 'complete',
      jobId: 'job-1',
      processedImages: [{ id: 'a', name: 'a', imagePaths: [] }],
      erroredImages: [{ path: '/b.jpg', error: 'corrupt' }],
      cancelled: false,
    });

    await expect(done).resolves.toMatchObject({
      status: 'complete',
      erroredImages: [{ path: '/b.jpg', error: 'corrupt' }],
    });
  });

  it('run() resolves when the worker crashes', async () => {
    const done = useImageJobStore.getState().run(['/a.jpg']);
    await vi.waitFor(() => expect(useImageJobStore.getState().jobs['job-1']).toBeDefined());
    emit({ type: 'failed', jobId: 'job-1', error: 'The image worker stopped unexpectedly.' });

    await expect(done).resolves.toMatchObject({ status: 'failed' });
  });

  it('keeps a finished job when an older snapshot arrives late', async () => {
    const done = useImageJobStore.getState().run(['/a.jpg']);
    await vi.waitFor(() => expect(useImageJobStore.getState().jobs['job-1']).toBeDefined());
    emit({ type: 'failed', jobId: 'job-1', error: 'boom' });
    useImageJobStore.getState().upsertJob({
      ...createImageJob('job-1', ['/a.jpg']),
      status: 'running',
    });

    expect(useImageJobStore.getState().jobs['job-1'].status).toBe('failed');
    await expect(done).resolves.toMatchObject({ status: 'failed' });
  });

  it('fills in imagePaths from a late snapshot without going backwards', () => {
    const { applyEvent, upsertJob } = useImageJobStore.getState();
    applyEvent({ type: 'failed', jobId: 'job-5', error: 'boom' });
    upsertJob({ ...createImageJob('job-5', ['/a.jpg']), status: 'running' });

    expect(useImageJobStore.getState().jobs['job-5']).toMatchObject({
      status: 'failed',
      imagePaths: ['/a.jpg'],
    });
  });

  it('forgets the oldest finished jobs', () => {
    const { upsertJob } = useImageJobStore.getState();
    for (let i = 0; i < 25; i++) {
      upsertJob({ ...createImageJob(`old-${i}`, []), status: 'complete' });
    }
    upsertJob(createImageJob('live', []));

    const ids = Object.keys(useImageJobStore.getState().jobs);
    expect(ids).toContain('live');
    expect(ids).not.toContain('old-0');
    expect(ids.filter((id) => id.startsWith('old-'))).toHaveLength(20);
  });

  it('catches up from main on refresh', async () => {
    vi.mocked(window.imageProcessor.getJob).mockResolvedValueOnce({
      ...createImageJob('job-7', ['/a.jpg']),
      status: 'running',
      donePaths: ['/a.jpg'],
    });

    await useImageJobStore.getState().refresh('job-7');

    expect(useImageJobStore.getState().jobs['job-7'].donePaths).toEqual(['/a.jpg']);
  });
});
