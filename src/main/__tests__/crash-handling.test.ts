import { describe, expect, it, vi } from 'vitest';

import {
  createErrorHandler,
  createRetryLimiter,
  describeError,
  isFatalError,
  UserFacingError,
} from '@/main/crash-handling';

describe('createRetryLimiter', () => {
  it('allows max attempts in the window, then refuses until the oldest one ages out', () => {
    let time = 0;
    const limiter = createRetryLimiter({ max: 3, windowMs: 60_000, now: () => time });

    expect(limiter.tryAcquire()).toBe(true);
    time = 10_000;
    expect(limiter.tryAcquire()).toBe(true);
    time = 20_000;
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);

    time = 59_999;
    expect(limiter.tryAcquire()).toBe(false);

    // The first attempt (at 0) is now a full window old.
    time = 60_000;
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });

  it('does not count refused attempts', () => {
    let time = 0;
    const limiter = createRetryLimiter({ max: 1, windowMs: 1_000, now: () => time });

    expect(limiter.tryAcquire()).toBe(true);
    time = 500;
    expect(limiter.tryAcquire()).toBe(false);
    time = 1_000;
    expect(limiter.tryAcquire()).toBe(true);
  });
});

describe('isFatalError', () => {
  it('treats user-facing errors and database corruption as fatal', () => {
    expect(isFatalError(new UserFacingError('Title', 'Body'))).toBe(true);
    expect(isFatalError(Object.assign(new Error('bad'), { code: 'SQLITE_CORRUPT' }))).toBe(true);
    expect(isFatalError(new Error('network blip'))).toBe(false);
    expect(isFatalError('a string')).toBe(false);
  });
});

describe('describeError', () => {
  it('uses the title and message of a user-facing error as is', () => {
    expect(describeError(new UserFacingError('Database is corrupt', 'Restore it'), true)).toEqual([
      'Database is corrupt',
      'Restore it',
    ]);
  });

  it('says whether startup failed and points at the log', () => {
    const [title, body] = describeError(new Error('EACCES: permission denied'), true);
    expect(title).toBe('Nubes could not start');
    expect(body).toContain('EACCES: permission denied');
    expect(body).toContain('log file');

    expect(describeError('boom', false)[0]).toBe('Nubes hit an error and has to quit');
  });
});

function setup() {
  const deps = { log: { error: vi.fn() }, showErrorBox: vi.fn(), quit: vi.fn() };
  return { deps, errors: createErrorHandler(deps) };
}

describe('createErrorHandler', () => {
  it('shows a dialog and quits for any error during startup', () => {
    const { deps, errors } = setup();
    const error = new Error('Storage.init failed');

    errors.handle('startup', error);

    expect(deps.log.error).toHaveBeenCalledWith('Startup failed, quitting:', error);
    expect(deps.showErrorBox).toHaveBeenCalledWith(
      'Nubes could not start',
      expect.stringContaining('Storage.init failed'),
    );
    expect(deps.quit).toHaveBeenCalledWith(true);
  });

  it('treats an unhandled rejection during startup the same way', () => {
    const { deps, errors } = setup();

    errors.handle('unhandledRejection', new Error('late promise'));

    expect(deps.showErrorBox).toHaveBeenCalledOnce();
    expect(deps.quit).toHaveBeenCalledWith(true);
  });

  it('only logs non-fatal errors after startup', () => {
    const { deps, errors } = setup();
    errors.startupComplete();
    const error = new Error('S3 request failed');

    errors.handle('uncaughtException', error);
    errors.handle('unhandledRejection', 'a rejected string');

    expect(deps.log.error).toHaveBeenCalledWith('uncaughtException:', error);
    expect(deps.log.error).toHaveBeenCalledWith('unhandledRejection:', 'a rejected string');
    expect(deps.showErrorBox).not.toHaveBeenCalled();
    expect(deps.quit).not.toHaveBeenCalled();
  });

  it('shows fatal errors after startup and quits normally', () => {
    const { deps, errors } = setup();
    errors.startupComplete();

    errors.handle('uncaughtException', new UserFacingError('Nubes database is corrupt', 'Body'));

    expect(deps.showErrorBox).toHaveBeenCalledWith('Nubes database is corrupt', 'Body');
    expect(deps.quit).toHaveBeenCalledWith(false);
  });

  it('shows one dialog when errors pile up while quitting', () => {
    const { deps, errors } = setup();

    errors.handle('startup', new Error('first'));
    errors.handle('uncaughtException', new Error('second'));

    expect(deps.showErrorBox).toHaveBeenCalledOnce();
    expect(deps.quit).toHaveBeenCalledOnce();
    expect(deps.log.error).toHaveBeenCalledTimes(2);
  });
});
