import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { session } from 'electron';
import baseLog from 'electron-log/main';

import { isWithin } from './media/access';

const log = baseLog.scope('file-requests');

/**
 * True when a file:// URL points inside `rendererDir`. The packaged renderer is itself a file://
 * page, and Chromium lets the CSP's `'self'` match any file: URL, so without this check a
 * `<script>` or `<img>` could load anything on disk.
 */
export function isAllowedFileUrl(url: string, rendererDir: string): boolean {
  let filePath: string;
  try {
    filePath = fileURLToPath(url);
  } catch {
    return false;
  }
  return isWithin(path.resolve(rendererDir), path.resolve(filePath));
}

/**
 * Cancel file:// requests outside the renderer bundle. Only for the packaged-style build: in dev
 * the page is served over http and Chromium already refuses file: subresources.
 * Call once, after `app.whenReady()`.
 */
export function restrictFileRequests(rendererDir: string) {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['file://*/*'] }, (details, done) => {
    const allowed = isAllowedFileUrl(details.url, rendererDir);
    if (!allowed) log.warn(`Blocked file request outside the renderer: ${details.url}`);
    done({ cancel: !allowed });
  });
}
