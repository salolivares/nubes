import fsp from 'node:fs/promises';
import path from 'node:path';

import { APP_HOST, APP_SCHEME } from '@/common/app-url';

import { isWithin } from '../media/access';

export type AppFileResolution = { ok: true; filePath: string } | { ok: false; reason: string };

function deny(reason: string): AppFileResolution {
  return { ok: false, reason };
}

/** True when `url` is a page or file of the packaged renderer (`nubes://app/...`). */
export function isAppSchemeUrl(url: URL): boolean {
  return (
    url.protocol === `${APP_SCHEME}:` &&
    url.hostname === APP_HOST &&
    url.port === '' &&
    url.username === '' &&
    url.password === ''
  );
}

/**
 * Map a `nubes://app/...` request to a regular file inside `rendererDir`. Anything else is
 * refused: other hosts, `..` or `.` segments (raw or percent-encoded), backslashes, NUL, `:`
 * (Windows drive letters and alternate data streams), folders, and paths whose real location,
 * after resolving symlinks, is outside the real `rendererDir`.
 */
export async function resolveAppFile(
  requestUrl: string,
  rendererDir: string,
): Promise<AppFileResolution> {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return deny('unparseable URL');
  }
  if (!isAppSchemeUrl(url)) return deny('unknown origin');

  let decoded: string;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return deny('bad percent-encoding');
  }
  if (decoded === '/' || decoded === '') decoded = '/index.html';
  if (!decoded.startsWith('/')) return deny('relative path');
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.includes(':')) {
    return deny('forbidden character in path');
  }

  const segments = decoded.slice(1).split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return deny('empty, . or .. segment');
  }

  // Check the path as written before touching the disk, then again after resolving symlinks.
  const root = path.resolve(rendererDir);
  const candidate = path.resolve(root, ...segments);
  if (!isWithin(root, candidate)) return deny('outside the renderer folder');

  let realRoot: string;
  let realFile: string;
  try {
    realRoot = await fsp.realpath(root);
    realFile = await fsp.realpath(candidate);
    if (!(await fsp.stat(realFile)).isFile()) return deny('not a regular file');
  } catch (err) {
    return deny(`not found (${(err as NodeJS.ErrnoException).code ?? 'error'})`);
  }
  if (!isWithin(realRoot, realFile)) return deny('resolves outside the renderer folder');

  return { ok: true, filePath: realFile };
}
