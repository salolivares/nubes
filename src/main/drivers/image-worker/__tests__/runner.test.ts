import { describe, expect, it } from 'vitest';

import type { ImageWorkerEvent, ProcessedImage } from '@/common/types';
import { createJobRunner } from '@/main/drivers/image-worker/runner';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function image(path: string): ProcessedImage {
  return { id: path, name: path, imagePaths: [] };
}

function setup() {
  const events: ImageWorkerEvent[] = [];
  const pending = new Map<string, ReturnType<typeof deferred<ProcessedImage>>>();
  const started: string[] = [];
  const runner = createJobRunner({
    processImage: (imagePath) => {
      started.push(imagePath);
      const d = deferred<ProcessedImage>();
      pending.set(imagePath, d);
      return d.promise;
    },
    post: (event) => events.push(event),
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { events, pending, started, runner, flush };
}

describe('createJobRunner', () => {
  it('runs a second resize only after the first one completes', async () => {
    const { events, pending, started, runner, flush } = setup();

    runner.handle({ type: 'resize', jobId: 'j1', imagePaths: ['/a'], outputFolder: '/out' });
    runner.handle({ type: 'resize', jobId: 'j2', imagePaths: ['/b'], outputFolder: '/out' });
    await flush();
    expect(started).toEqual(['/a']);

    pending.get('/a')!.resolve(image('/a'));
    await flush();
    expect(started).toEqual(['/a', '/b']);
    expect(events.filter((e) => e.type === 'complete').map((e) => e.jobId)).toEqual(['j1']);

    pending.get('/b')!.resolve(image('/b'));
    await flush();
    expect(events.filter((e) => e.type === 'complete').map((e) => e.jobId)).toEqual(['j1', 'j2']);
  });

  it('reports a failed image as progress with an error and keeps going', async () => {
    const { events, pending, runner, flush } = setup();

    runner.handle({ type: 'resize', jobId: 'j1', imagePaths: ['/a', '/b'], outputFolder: '/out' });
    await flush();
    pending.get('/a')!.reject(new Error('corrupt'));
    await flush();
    pending.get('/b')!.resolve(image('/b'));
    await flush();

    expect(events).toEqual([
      expect.objectContaining({ type: 'progress', jobId: 'j1', path: '/a', error: 'corrupt' }),
      expect.objectContaining({ type: 'progress', jobId: 'j1', path: '/b', current: 2 }),
      {
        type: 'complete',
        jobId: 'j1',
        processedImages: [image('/b')],
        erroredImages: [{ path: '/a', error: 'corrupt' }],
        cancelled: false,
      },
    ]);
  });

  it('stops after the current image when cancelled', async () => {
    const { events, pending, started, runner, flush } = setup();

    runner.handle({
      type: 'resize',
      jobId: 'j1',
      imagePaths: ['/a', '/b', '/c'],
      outputFolder: '/out',
    });
    await flush();
    runner.handle({ type: 'cancel', jobId: 'j1' });
    pending.get('/a')!.resolve(image('/a'));
    await flush();

    expect(started).toEqual(['/a']);
    expect(events.at(-1)).toEqual({
      type: 'complete',
      jobId: 'j1',
      processedImages: [image('/a')],
      erroredImages: [],
      cancelled: true,
    });
  });

  it('skips a queued job that was cancelled before it started', async () => {
    const { events, pending, started, runner, flush } = setup();

    runner.handle({ type: 'resize', jobId: 'j1', imagePaths: ['/a'], outputFolder: '/out' });
    runner.handle({ type: 'resize', jobId: 'j2', imagePaths: ['/b'], outputFolder: '/out' });
    runner.handle({ type: 'cancel', jobId: 'j2' });
    await flush();
    pending.get('/a')!.resolve(image('/a'));
    await flush();

    expect(started).toEqual(['/a']);
    expect(events.at(-1)).toMatchObject({ type: 'complete', jobId: 'j2', cancelled: true });
  });
});
