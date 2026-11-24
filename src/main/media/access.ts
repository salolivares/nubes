import fsp from 'node:fs/promises';
import path from 'node:path';

import { MEDIA_HOST, MEDIA_SCHEME, MEDIA_THUMBNAIL_WIDTH } from '@/common/media-url';

/** File types the protocol serves. Everything it serves is an image. */
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export type PathDenied = { ok: false; status: 400 | 403 | 404; reason: string };

/** Result of checking a path. `filePath` is the real path, with symlinks resolved. */
export type PathCheck = { ok: true; filePath: string } | PathDenied;

export type MediaResolution = { ok: true; filePath: string; width?: number } | PathDenied;

function deny(status: 400 | 403 | 404, reason: string): PathDenied {
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

/** `..` as a segment, with either separator. */
function hasTraversal(filePath: string): boolean {
  return filePath.split(/[\\/]/).includes('..');
}

/**
 * Windows paths that reach devices or alternate data streams: `\\?\`, `\\.\` and a `:` anywhere
 * but after the drive letter (`photo.jpg:secret`).
 */
export function isWindowsSpecialPath(filePath: string, sep: string): boolean {
  if (sep !== '\\') return false;
  return /^[\\/]{2}[?.][\\/]/.test(filePath) || filePath.indexOf(':', 2) !== -1;
}

/**
 * Resolve symlinks. 404 only when nothing is there (callers may let a missing file through to
 * report it later). A folder, device, FIFO, or any other error is 403, so it can't pass as missing.
 */
async function realFile(filePath: string): Promise<PathCheck> {
  try {
    const real = await fsp.realpath(filePath);
    const stat = await fsp.stat(real);
    return stat.isFile() ? { ok: true, filePath: real } : deny(403, 'not a regular file');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return deny(404, 'not found');
    return deny(403, `unreadable (${code ?? 'error'})`);
  }
}

/**
 * Decides which files `nubes-media://` may serve:
 * - files under one of `roots()` (the photosets folder), after resolving symlinks, and
 * - source files the user picked this session, added with `allowPickedFiles()`.
 *
 * The allowlist lives only in main. It grows from the open dialog and from drops. A drop is
 * resolved in preload, which looks up the disk paths of the dropped File objects and sends them
 * over `IMAGE_PICKER_ALLOW_DROPPED`. Page code can't name paths that way: preload only accepts real
 * File objects, and page code can't give a File a disk path. A compromised renderer process can
 * still call that channel directly, so allowPickedFiles() treats its input as untrusted.
 */
export class MediaAccess {
  /** Real paths of picked files. */
  private readonly picked = new Set<string>();
  /** The paths as they were picked, normalized. Lets resolve() gate a request before any disk I/O. */
  private readonly pickedInputs = new Set<string>();

  constructor(
    private readonly roots: () => string[],
    private readonly sep: string = path.sep,
  ) {}

  /**
   * The single entry point for "the user picked this file". Call it from main with paths that
   * came from a user action (the open dialog, a drop). Keeps only existing image files, stored by
   * real path, and returns the input paths it accepted.
   */
  async allowPickedFiles(filePaths: string[]): Promise<string[]> {
    const accepted: string[] = [];
    for (const filePath of filePaths) {
      if (
        !path.isAbsolute(filePath) ||
        filePath.includes('\0') ||
        hasTraversal(filePath) ||
        isWindowsSpecialPath(filePath, this.sep) ||
        !isImagePath(filePath)
      ) {
        continue;
      }
      const file = await realFile(filePath);
      if (!file.ok || !isImagePath(file.filePath)) continue;
      const real = file.filePath;
      this.picked.add(real);
      this.pickedInputs.add(path.resolve(filePath));
      accepted.push(filePath);
    }
    return accepted;
  }

  /** Forget every picked file. Tests use this; the app keeps picks until it quits. */
  clearPicked(): void {
    this.picked.clear();
    this.pickedInputs.clear();
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
    const params = [...url.searchParams.keys()];
    if (params.length > 0) {
      if (params.length > 1 || params[0] !== 'w') return deny(400, 'unsupported query');
      if (url.searchParams.get('w') !== String(MEDIA_THUMBNAIL_WIDTH)) {
        return deny(400, 'unsupported width');
      }
      width = MEDIA_THUMBNAIL_WIDTH;
    }

    const check = await this.checkFile(requested, { picked: true });
    return check.ok ? { ...check, width } : check;
  }

  /**
   * Check a path that came from the renderer before main reads, uploads or deletes it. The path
   * must be an existing image file under one of the roots, after resolving symlinks. With
   * `picked`, files on the picked allowlist pass too. Paths outside are refused before any disk
   * access; 404 means the path passed that gate but there is no regular file there.
   */
  async checkFile(
    requested: string,
    { picked = false }: { picked?: boolean } = {},
  ): Promise<PathCheck> {
    if (requested.includes('\0')) return deny(400, 'NUL in path');
    if (!path.isAbsolute(requested)) return deny(403, 'path is not absolute');
    // Reject traversal outright instead of trusting normalization to land somewhere safe.
    if (hasTraversal(requested)) return deny(403, 'path contains ..');
    if (isWindowsSpecialPath(requested, this.sep)) return deny(403, 'device or stream path');
    if (!isImagePath(requested)) return deny(403, 'not an image');

    // Gate on the path as written before touching the disk. realpath() on an arbitrary path could
    // open a UNC share (an SMB connection that leaks NTLM hashes) or a device.
    const realRoots = await this.realRoots();
    const normalized = path.resolve(requested);
    const plausible =
      (picked && (this.pickedInputs.has(normalized) || this.picked.has(normalized))) ||
      this.roots().some((root) => isWithin(path.resolve(root), normalized)) ||
      realRoots.some((root) => isWithin(root, normalized));
    if (!plausible) return deny(403, 'outside allowed roots');

    const file = await realFile(requested);
    if (!file.ok) return file;
    const real = file.filePath;
    // A symlink named photo.jpg could point at something that isn't an image.
    if (!isImagePath(real)) return deny(403, 'not an image');

    if (picked && this.picked.has(real)) return { ok: true, filePath: real };
    if (realRoots.some((root) => isWithin(root, real))) return { ok: true, filePath: real };

    return deny(403, 'outside allowed roots');
  }

  /**
   * True when the path as written is inside one of the roots. Any file type, no disk access, so
   * it can't follow symlinks: use checkFile() before reading a file.
   */
  isInRoots(requested: string): boolean {
    if (
      requested.includes('\0') ||
      !path.isAbsolute(requested) ||
      hasTraversal(requested) ||
      isWindowsSpecialPath(requested, this.sep)
    ) {
      return false;
    }
    const normalized = path.resolve(requested);
    return this.roots().some((root) => isWithin(path.resolve(root), normalized));
  }

  /** The roots with symlinks resolved. Roots that don't exist yet are skipped. */
  private async realRoots(): Promise<string[]> {
    const real: string[] = [];
    for (const root of this.roots()) {
      try {
        real.push(await fsp.realpath(root));
      } catch {
        // No photosets folder yet.
      }
    }
    return real;
  }
}
