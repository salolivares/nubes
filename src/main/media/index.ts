import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { app, net, protocol } from 'electron';
import baseLog from 'electron-log/main';
import sharp from 'sharp';

import { PHOTOSETS_DIR } from '@/common/constants';
import { MEDIA_SCHEME } from '@/common/media-url';

import { MediaAccess } from './access';

const log = baseLog.scope('media');

export const mediaAccess = new MediaAccess(() => [
  path.join(app.getPath('userData'), PHOTOSETS_DIR),
]);

/**
 * Add files the user picked to the `nubes-media://` allowlist. This is the one place a dialog or a
 * drop registers a source file. Only call it with paths from a user action handled in main.
 */
export function allowPickedFiles(filePaths: string[]): Promise<string[]> {
  return mediaAccess.allowPickedFiles(filePaths);
}

/**
 * Must run before `app` is ready. `standard` gives the scheme normal URL parsing, `secure` keeps
 * it from counting as mixed content. It does not get `bypassCSP`, so `img-src` still applies.
 */
export function registerMediaScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true } },
  ]);
}

const RESPONSE_HEADERS = {
  'Cache-Control': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
};

/** Register the handler. Call once, after `app.whenReady()`. */
export function registerMediaProtocol() {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    if (request.method !== 'GET') return new Response(null, { status: 405 });

    const result = await mediaAccess.resolve(request.url);
    if (!result.ok) {
      log.warn(`${result.status} ${result.reason}: ${request.url}`);
      return new Response(null, { status: result.status });
    }

    try {
      if (result.width) {
        // rotate() applies EXIF orientation, which the jpeg re-encode would otherwise drop.
        const buffer = await sharp(result.filePath)
          .rotate()
          .resize({ width: result.width })
          .jpeg({ quality: 80 })
          .toBuffer();
        return new Response(new Uint8Array(buffer), {
          headers: { ...RESPONSE_HEADERS, 'Content-Type': 'image/jpeg' },
        });
      }

      const file = await net.fetch(pathToFileURL(result.filePath).toString());
      const headers = new Headers(file.headers);
      for (const [key, value] of Object.entries(RESPONSE_HEADERS)) headers.set(key, value);
      return new Response(file.body, { status: file.status, headers });
    } catch (err) {
      log.error(`Failed to serve ${result.filePath}:`, err);
      return new Response(null, { status: 500 });
    }
  });
}
