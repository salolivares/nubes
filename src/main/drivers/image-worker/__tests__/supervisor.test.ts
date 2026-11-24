import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImageJobEvent, ImageWorkerRequest } from '@/common/types';
import type { WorkerHooks } from '@/main/drivers/image-worker/supervisor';
import { ImageWorkerSupervisor } from '@/main/drivers/image-worker/supervisor';

class FakeWorker {
  posted: ImageWorkerRequest[] = [];
  killed = false;
  constructor(private hooks: WorkerHooks) {}
  postMessage(msg: ImageWorkerRequest) {
    this.posted.push(msg);
  }
  kill() {
    this.killed = true;
  }
  send(data: unknown) {
    this.hooks.onMessage(data);
  }
  exit(code = 1) {
    this.hooks.onExit(code);
  }
}

const silentLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function setup() {
  const workers: FakeWorker[] = [];
  const events: ImageJobEvent[] = [];
  let nextId = 0;
  const supervisor = new ImageWorkerSupervisor({
    spawn: (hooks) => {
      const worker = new FakeWorker(hooks);
      workers.push(worker);
      return worker;
    },
    outputFolder: () => '/out',
    onEvent: (event) => events.push(event),
    createJobId: () => `job-${++nextId}`,
    cancelGraceMs: 1000,
    log: silentLog,
  });
  return { supervisor, workers, events };
}

function complete(jobId: string, cancelled = false) {
  return { type: 'complete', jobId, processedImages: [], erroredImages: [], cancelled };
}

describe('ImageWorkerSupervisor', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('forks the worker on the first request and starts the job', () => {
    const { supervisor, workers, events } = setup();
    expect(workers).toHaveLength(0);

    const job = supervisor.submit(['/a.jpg']);

    expect(job).toMatchObject({ jobId: 'job-1', status: 'running', imagePaths: ['/a.jpg'] });
    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toEqual([
      { type: 'resize', jobId: 'job-1', imagePaths: ['/a.jpg'], outputFolder: '/out' },
    ]);
    expect(events).toEqual([{ type: 'started', jobId: 'job-1' }]);
    expect(supervisor.getJob('job-1')?.status).toBe('running');
  });

  it('sends the next job only after the current one completes', () => {
    const { supervisor, workers } = setup();
    supervisor.submit(['/a.jpg']);
    const second = supervisor.submit(['/b.jpg']);

    expect(second.status).toBe('queued');
    expect(workers[0].posted.map((m) => m.jobId)).toEqual(['job-1']);

    workers[0].send(complete('job-1'));

    expect(workers[0].posted.map((m) => m.jobId)).toEqual(['job-1', 'job-2']);
    expect(supervisor.getJob('job-1')?.status).toBe('complete');
    expect(supervisor.getJob('job-2')?.status).toBe('running');
  });

  it('forwards valid worker messages', () => {
    const { supervisor, workers, events } = setup();
    supervisor.submit(['/a.jpg']);

    workers[0].send({
      type: 'progress',
      jobId: 'job-1',
      current: 1,
      total: 1,
      path: '/a.jpg',
      name: 'a.jpg',
    });

    expect(events.map((e) => e.type)).toEqual(['started', 'progress']);
    expect(supervisor.getJob('job-1')?.donePaths).toEqual(['/a.jpg']);
  });

  it('logs and drops an invalid message when no job is in flight', () => {
    const { supervisor, workers, events } = setup();
    supervisor.submit(['/a.jpg']);
    workers[0].send(complete('job-1'));
    silentLog.error.mockClear();

    workers[0].send({ type: 'progress', jobId: 'job-1' });

    expect(silentLog.error).toHaveBeenCalled();
    expect(events.map((e) => e.type)).toEqual(['started', 'complete']);
    expect(workers[0].killed).toBe(false);
  });

  it('fails the job and restarts the worker when it sends an invalid message', () => {
    const { supervisor, workers, events } = setup();
    supervisor.submit(['/a.jpg']);
    supervisor.submit(['/b.jpg']);

    workers[0].send({ type: 'complete', jobId: 'job-1', erroredImages: ['/a.jpg'] });

    expect(events.at(-1)).toMatchObject({ type: 'failed', jobId: 'job-1' });
    expect(workers[0].killed).toBe(true);
    expect(workers).toHaveLength(1);

    workers[0].exit(0);
    expect(workers[1].posted.map((m) => m.jobId)).toEqual(['job-2']);
  });

  it('ignores worker messages for a job that is not in flight', () => {
    const { supervisor, workers, events } = setup();
    supervisor.submit(['/a.jpg']);
    workers[0].send(complete('job-99'));

    expect(events.map((e) => e.type)).toEqual(['started']);
  });

  it('fails the in-flight job when the worker exits and forks a fresh one next time', () => {
    const { supervisor, workers, events } = setup();
    supervisor.submit(['/a.jpg']);

    workers[0].exit(9);

    expect(events.at(-1)).toEqual({
      type: 'failed',
      jobId: 'job-1',
      error: expect.stringContaining('stopped unexpectedly'),
    });
    expect(supervisor.getJob('job-1')?.status).toBe('failed');

    supervisor.submit(['/b.jpg']);
    expect(workers).toHaveLength(2);
    expect(workers[1].posted.map((m) => m.jobId)).toEqual(['job-2']);
  });

  it('moves queued jobs to a fresh worker after a crash', () => {
    const { supervisor, workers } = setup();
    supervisor.submit(['/a.jpg']);
    supervisor.submit(['/b.jpg']);

    workers[0].exit(1);

    expect(supervisor.getJob('job-1')?.status).toBe('failed');
    expect(workers).toHaveLength(2);
    expect(workers[1].posted.map((m) => m.jobId)).toEqual(['job-2']);
  });

  it('cancels a queued job without sending it to the worker', () => {
    const { supervisor, workers, events } = setup();
    supervisor.submit(['/a.jpg']);
    supervisor.submit(['/b.jpg']);

    supervisor.cancel('job-2');
    workers[0].send(complete('job-1'));

    expect(workers[0].posted.map((m) => m.jobId)).toEqual(['job-1']);
    expect(supervisor.getJob('job-2')?.status).toBe('cancelled');
    expect(events).toContainEqual(expect.objectContaining({ type: 'complete', jobId: 'job-2' }));
  });

  it('asks the worker to cancel the running job', () => {
    const { supervisor, workers } = setup();
    supervisor.submit(['/a.jpg', '/b.jpg']);

    supervisor.cancel('job-1');
    expect(workers[0].posted.at(-1)).toEqual({ type: 'cancel', jobId: 'job-1' });

    workers[0].send(complete('job-1', true));
    vi.advanceTimersByTime(5000);

    expect(supervisor.getJob('job-1')?.status).toBe('cancelled');
    expect(workers[0].killed).toBe(false);
  });

  it('kills a worker that ignores a cancel past the grace period', () => {
    const { supervisor, workers, events } = setup();
    supervisor.submit(['/a.jpg']);
    supervisor.cancel('job-1');

    vi.advanceTimersByTime(1000);
    expect(workers[0].killed).toBe(true);

    // Not forgotten until it actually exits, so a new request waits for it.
    supervisor.submit(['/b.jpg']);
    expect(workers).toHaveLength(1);

    workers[0].exit(0);

    expect(supervisor.getJob('job-1')?.status).toBe('cancelled');
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'failed' }));
    expect(workers).toHaveLength(2);
    expect(workers[1].posted.map((m) => m.jobId)).toEqual(['job-2']);
  });

  it('does not hand a new job to a worker that is shutting down', () => {
    const { supervisor, workers } = setup();
    supervisor.submit(['/a.jpg']);
    workers[0].send(complete('job-1'));

    supervisor.killWorker();
    supervisor.submit(['/b.jpg']);
    expect(workers[0].posted.map((m) => m.jobId)).toEqual(['job-1']);

    workers[0].exit(0);
    expect(workers[1].posted.map((m) => m.jobId)).toEqual(['job-2']);
  });

  it('still reports a crash as failed if a cancel arrives while the worker is dying', () => {
    const { supervisor, workers } = setup();
    supervisor.submit(['/a.jpg']);

    supervisor.killWorker();
    supervisor.cancel('job-1');
    workers[0].exit(0);

    expect(workers[0].posted.map((m) => m.type)).toEqual(['resize']);
    expect(supervisor.getJob('job-1')?.status).toBe('failed');
  });

  it('fails a job submitted after dispose instead of queueing it forever', () => {
    const { supervisor, workers, events } = setup();
    supervisor.dispose();

    const job = supervisor.submit(['/a.jpg']);

    expect(job.status).toBe('failed');
    expect(events.at(-1)).toMatchObject({ type: 'failed', jobId: job.jobId });
    expect(workers).toHaveLength(0);
  });

  it('does not fork again after dispose', () => {
    const { supervisor, workers } = setup();
    supervisor.submit(['/a.jpg']);
    supervisor.submit(['/b.jpg']);

    supervisor.dispose();
    expect(workers[0].killed).toBe(true);
    workers[0].exit(0);

    expect(workers).toHaveLength(1);
    expect(supervisor.getJob('job-1')?.status).toBe('failed');
    expect(supervisor.getJob('job-2')?.status).toBe('failed');
  });
});
