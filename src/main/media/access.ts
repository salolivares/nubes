import fsp from 'node:fs/promises';
import path from 'node:path';

import { MEDIA_HOST, MEDIA_SCHEME, MEDIA_THUMBNAIL_WIDTH } from '@/common/media-url';

/** File types the protocol serves. Everything it serves is an image. */
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export type MediaResolution =
  | { ok: true; filePath: string; width?: number }
  | { ok: false; status: 400 | 403 | 404; reason: string };

function deny(status: 400 | 403 | 404, reason: string): MediaResolution {
  return { ok: false, status, reason };
}

function isImagePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * True when `child` is inside `root`. `path.relative` returns an absolute path when the two are
 * on different Windows drives, and a path starting with `..` when `child` is outside.
 */
export function isWithin(root: string, child: string): boolean {
  const rel = path.relative(root, child);
  if (rel === '' || path.isAbsolute(rel)) return false;
  return rel.split(path.sep)[0] !== '..';
}

/** Resolve symlinks. Returns null when the path doesn't exist or isn't a regular file. */
async function realFile(filePath: string): Promise<string | null> {
  try {
    const real = await fsp.realpath(filePath);
    const stat = await fsp.stat(real);
    return stat.isFile() ? real : null;
  } catch {
    return null;
  }
}

/**
 * Decides which files `nubes-media://` may serve:
 * - files under one of `roots()` (the photosets folder), after resolving symlinks, and
 * - source files the user picked this session, added with `allowPickedFiles()`.
 *
 * The allowlist lives only in main and only grows from main-side code paths (the open dialog).
 * The renderer can't add to it.
 */
export class MediaAccess {
  private readonly picked = new Set<string>();

  constructor(private readonly roots: () => string[]) {}

  /**
   * The single entry point for "the user picked this file". Call it from main with paths that
   * came from a user action (the open dialog, a drop). Keeps only existing image files, stored by
   * real path, and returns the input paths it accepted.
   */
  async allowPickedFiles(filePaths: string[]): Promise<string[]> {
    const accepted: string[] = [];
    for (const filePath of filePaths) {
      if (!path.isAbsolute(filePath) || filePath.includes('\0') || !isImagePath(filePath)) {
        continue;
      }
      const real = await realFile(filePath);
      if (!real || !isImagePath(real)) continue;
      this.picked.add(real);
      accepted.push(filePath);
    }
    return accepted;
  }

  /** Forget every picked file. Tests use this; the app keeps picks until it quits. */
  clearPicked(): void {
    this.picked.clear();
  }

  async resolve(requestUrl: string): Promise<MediaResolution> {
    let url: URL;
    try {
      url = new URL(requestUrl);
    } catch {
      return deny(400, 'unparseable URL');
    }
    if (url.protocol !== `${MEDIA_SCHEME}:` || url.host !== MEDIA_HOST) {
      return deny(404, 'unknown host');
    }

    // mediaUrl() encodes the whole path as one segment. A raw `/` means someone built the URL by
    // hand, and the URL parser may already have folded `..` out of it.
    const encoded = url.pathname.slice(1);
    if (encoded === '' || encoded.includes('/')) return deny(400, 'path must be one segment');

    let requested: string;
    try {
      requested = decodeURIComponent(encoded);
    } catch {
      return deny(400, 'bad percent-encoding');
    }

    let width: number | undefined;
    const w = url.searchParams.get('w');
    if (w !== null) {
      if (w !== String(MEDIA_THUMBNAIL_WIDTH)) return deny(400, 'unsupported width');
      width = MEDIA_THUMBNAIL_WIDTH;
    }

    if (requested.includes('\0')) return deny(400, 'NUL in path');
    if (!path.isAbsolute(requested)) return deny(403, 'path is not absolute');
    // Reject traversal outright instead of trusting normalization to land somewhere safe.
    if (requested.split(/[\\/]/).includes('..')) return deny(403, 'path contains ..');
    if (!isImagePath(requested)) return deny(403, 'not an image');

    const real = await realFile(requested);
    if (!real) return deny(404, 'not found');
    // A symlink named photo.jpg could point at something that isn't an image.
    if (!isImagePath(real)) return deny(403, 'not an image');

    if (this.picked.has(real)) return { ok: true, filePath: real, width };

    for (const root of this.roots()) {
      let realRoot: string;
      try {
        realRoot = await fsp.realpath(root);
      } catch {
        continue;
      }
      if (isWithin(realRoot, real)) return { ok: true, filePath: real, width };
    }

    return deny(403, 'outside allowed roots');
  }
}
