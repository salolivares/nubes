import { isCorruptionError } from './drivers/database-maintenance';

/**
 * An error whose message is written for the user. Thrown where the code knows what went wrong
 * and how to recover (a corrupt database, for example), so the central handler can show it as
 * is. Always fatal: the app quits after showing it.
 */
export class UserFacingError extends Error {
  constructor(
    readonly title: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'UserFacingError';
  }
}

/**
 * Allows at most `max` attempts in any `windowMs` window. Used to stop a renderer that crashes
 * on load from reloading forever.
 */
export function createRetryLimiter({
  max,
  windowMs,
  now = Date.now,
}: {
  max: number;
  windowMs: number;
  now?: () => number;
}) {
  const attempts: number[] = [];
  return {
    /** Records an attempt and returns true, or returns false if the limit is reached. */
    tryAcquire(): boolean {
      const time = now();
      while (attempts.length > 0 && time - attempts[0] >= windowMs) attempts.shift();
      if (attempts.length >= max) return false;
      attempts.push(time);
      return true;
    },
  };
}

/** After startup, only these errors quit the app. Everything else is logged and the app runs on. */
export function isFatalError(error: unknown): boolean {
  return error instanceof UserFacingError || isCorruptionError(error);
}

/** Title and body for the error dialog. */
export function describeError(error: unknown, duringStartup: boolean): [string, string] {
  if (error instanceof UserFacingError) return [error.title, error.message];
  const title = duringStartup ? 'Nubes could not start' : 'Nubes hit an error and has to quit';
  const detail = error instanceof Error ? error.message || error.name : String(error);
  return [title, `${detail}\n\nThe log file has the details.`];
}

export type ErrorSource = 'startup' | 'uncaughtException' | 'unhandledRejection';

export interface ErrorHandlerDeps {
  log: { error: (...args: unknown[]) => void };
  showErrorBox: (title: string, content: string) => void;
  /** Quit the app. Called with true during startup, when nothing is open yet worth saving. */
  quit: (duringStartup: boolean) => void;
}

/**
 * The one place main-process errors end up: startup failures, uncaught exceptions and unhandled
 * rejections. Until `startupComplete()` is called, any error shows a dialog and quits, so a
 * packaged app never fails to open without saying why. After that, only fatal errors
 * (see `isFatalError`) do.
 */
export function createErrorHandler({ log, showErrorBox, quit }: ErrorHandlerDeps) {
  let started = false;
  let quitting = false;

  return {
    startupComplete() {
      started = true;
    },
    handle(source: ErrorSource, error: unknown) {
      const duringStartup = !started;
      const fatal = duringStartup || isFatalError(error);
      const where =
        source === 'startup'
          ? 'Startup failed'
          : `${source}${duringStartup ? ' during startup' : ''}`;
      log.error(`${where}${fatal ? ', quitting' : ''}:`, error);
      // A second error while the first dialog is up, or while quitting, only gets logged.
      if (!fatal || quitting) return;
      quitting = true;
      const [title, content] = describeError(error, duringStartup);
      showErrorBox(title, content);
      quit(duringStartup);
    },
  };
}
