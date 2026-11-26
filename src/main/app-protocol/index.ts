import fsp from 'node:fs/promises';
import path from 'node:path';

import type { CustomScheme } from 'electron';
import { protocol } from 'electron';
import baseLog from 'electron-log/main';

import { APP_SCHEME } from '@/common/app-url';
import { contentSecurityPolicy } from '@/common/csp';

import { resolveAppFile } from './resolve';

const log = baseLog.scope('app-protocol');

/**
 * `standard` gives `nubes://app` a real origin, so CSP `'self'` and same-origin checks mean the
 * renderer bundle and nothing else. `secure` makes it a secure context. `supportFetchAPI` and
 * `corsEnabled` let Chromium fetch the bundle's ES modules (module scripts load in CORS mode).
 * No `bypassCSP`.
 */
export const APP_SCHEME_PRIVILEGES: CustomScheme = {
  scheme: APP_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
};

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

/** Headers on every response. The CSP is the only one the page gets; index.html has no meta CSP. */
export function appResponseHeaders(filePath: string): Record<string, string> {
  return {
    'Content-Type':
      CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Content-Security-Policy': contentSecurityPolicy(false),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-cache',
  };
}

/**
 * Serve the renderer bundle from `nubes://app/`. Only files inside `rendererDir` are served; every
 * other request gets a 404. Call once, after `app.whenReady()`, in packaged-style builds only (dev
 * loads from the Vite dev server).
 */
export function registerAppProtocol(rendererDir: string) {
  protocol.handle(APP_SCHEME, async (request) => {
    if (request.method !== 'GET') return new Response(null, { status: 405 });

    const result = await resolveAppFile(request.url, rendererDir);
    if (!result.ok) {
      log.warn(`404 ${result.reason}: ${request.url}`);
      return new Response(null, { status: 404 });
    }

    try {
      const body = await fsp.readFile(result.filePath);
      return new Response(new Uint8Array(body), { headers: appResponseHeaders(result.filePath) });
    } catch (err) {
      log.error(`Failed to serve ${result.filePath}:`, err);
      return new Response(null, { status: 500 });
    }
  });
}
