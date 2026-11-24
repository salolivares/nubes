import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ProcessedImage } from '@/common/types';
import { canReveal } from '@/main/listeners/photoset';
import { MediaAccess } from '@/main/media/access';
import {
  assertResizePaths,
  assertStoredPaths,
  assertUploadPaths,
  deletablePaths,
} from '@/main/media/guards';

let tmpDir: string;
let photosetsDir: string;
let outsideDir: string;
let access: MediaAccess;

function write(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'img');
  return filePath;
}

function album(...imagePaths: string[]): ProcessedImage[] {
  return [
    {
      id: 'a',
      name: 'a',
      imagePaths: imagePaths.map((imagePath) => ({
        imagePath,
        type: 'jpg' as const,
        resolution: 128,
        byteLength: 3,
      })),
    },
  ];
}

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nubes-guards-test-')));
  photosetsDir = path.join(tmpDir, 'userData', 'photosets');
  outsideDir = path.join(tmpDir, 'outside');
  fs.mkdirSync(photosetsDir, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });
  access = new MediaAccess(() => [photosetsDir]);
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe('s3:createAlbum paths', () => {
  it('allows outputs in the photosets folder', async () => {
    const file = write(path.join(photosetsDir, '1', 'a_128.jpg'));
    await expect(assertUploadPaths(access, album(file))).resolves.toBeUndefined();
  });

  it('refuses the whole album when one path is outside', async () => {
    const good = write(path.join(photosetsDir, '1', 'a_128.jpg'));
    const secret = write(path.join(outsideDir, 'id_rsa.jpg'));
    await expect(assertUploadPaths(access, album(good, secret))).rejects.toThrow(
      /Refused to upload/,
    );
  });

  it('refuses non-image files, inside the photosets folder or next to it', async () => {
    const notes = write(path.join(photosetsDir, '1', 'notes.txt'));
    const db = write(path.join(tmpDir, 'userData', 'nubes.db'));
    await expect(assertUploadPaths(access, album(notes))).rejects.toThrow(/Refused/);
    await expect(assertUploadPaths(access, album(db))).rejects.toThrow(/Refused/);
  });

  it('refuses an image-named folder or FIFO instead of passing it as missing', async () => {
    const folder = path.join(photosetsDir, '1', 'folder.jpg');
    fs.mkdirSync(folder, { recursive: true });
    await expect(assertUploadPaths(access, album(folder))).rejects.toThrow(/Refused/);
    if (process.platform !== 'win32') {
      const fifo = path.join(photosetsDir, '1', 'fifo.jpg');
      execFileSync('mkfifo', [fifo]);
      await expect(assertUploadPaths(access, album(fifo))).rejects.toThrow(/Refused/);
    }
  });

  it('refuses a symlink in the photosets folder to a device outside it', async () => {
    if (process.platform === 'win32') return;
    const link = path.join(photosetsDir, 'zero.jpg');
    fs.symlinkSync('/dev/zero', link);
    await expect(assertUploadPaths(access, album(link))).rejects.toThrow(/Refused/);
  });

  it('refuses a picked file, which is a source and not an output', async () => {
    const picked = write(path.join(outsideDir, 'IMG_0001.jpg'));
    await access.allowPickedFiles([picked]);
    await expect(assertUploadPaths(access, album(picked))).rejects.toThrow(/Refused/);
  });

  it('refuses a symlink in the photosets folder that points outside', async () => {
    const secret = write(path.join(outsideDir, 'secret.jpg'));
    const link = path.join(photosetsDir, 'link.jpg');
    fs.symlinkSync(secret, link);
    await expect(assertUploadPaths(access, album(link))).rejects.toThrow(/Refused/);
  });

  it('passes a missing output through so the driver reports it', async () => {
    const missing = path.join(photosetsDir, '1', 'gone_128.jpg');
    await expect(assertUploadPaths(access, album(missing))).resolves.toBeUndefined();
  });
});

describe('image-processor:resize paths', () => {
  it('allows picked files and images in the photosets folder', async () => {
    const picked = write(path.join(outsideDir, 'IMG_0001.jpg'));
    await access.allowPickedFiles([picked]);
    const inRoot = write(path.join(photosetsDir, '1', 'a_2880.jpg'));
    await expect(assertResizePaths(access, [picked, inRoot])).resolves.toBeUndefined();
  });

  it('refuses a file outside the roots that was never picked', async () => {
    const other = write(path.join(outsideDir, 'private.jpg'));
    await expect(assertResizePaths(access, [other])).rejects.toThrow(/Refused to process/);
  });

  it('refuses bare file names', async () => {
    await expect(assertResizePaths(access, ['dropped.jpg'])).rejects.toThrow(/Refused/);
  });

  it('refuses without revealing whether an outside file exists', async () => {
    const missing = path.join(outsideDir, 'nope.jpg');
    const present = write(path.join(outsideDir, 'yes.jpg'));
    await expect(assertResizePaths(access, [missing])).rejects.toThrow(/Refused/);
    await expect(assertResizePaths(access, [present])).rejects.toThrow(/Refused/);
  });
});

describe('photoset:delete and photoset:removeFiles paths', () => {
  it('keeps only existing images in the photosets folder', async () => {
    const inRoot = write(path.join(photosetsDir, '1', 'a_128.jpg'));
    const original = write(path.join(outsideDir, 'DSCF0001.jpg'));
    const sibling = write(path.join(tmpDir, 'userData', 'photosets-evil', 'a.jpg'));
    const traversal = `${photosetsDir}${path.sep}..${path.sep}..${path.sep}outside${path.sep}DSCF0001.jpg`;
    expect(await deletablePaths(access, [inRoot, original, sibling, traversal, ''])).toEqual([
      inRoot,
    ]);
  });

  it('does not delete a picked source file', async () => {
    const picked = write(path.join(outsideDir, 'IMG_0001.jpg'));
    await access.allowPickedFiles([picked]);
    expect(await deletablePaths(access, [picked])).toEqual([]);
  });
});

describe('photoset:addImages paths', () => {
  const output = (imagePath: string) => ({
    imagePath,
    type: 'jpg' as const,
    resolution: 128,
    byteLength: 3,
  });

  it('allows outputs in the photosets folder and an empty originalPath', () => {
    const inRoot = path.join(photosetsDir, '1', 'a_128.jpg');
    expect(() =>
      assertStoredPaths(access, [
        { name: 'a', originalPath: inRoot, outputs: [output(inRoot)] },
        { name: 'b', originalPath: '', outputs: [] },
      ]),
    ).not.toThrow();
  });

  it('refuses an output outside the photosets folder', () => {
    const inRoot = path.join(photosetsDir, '1', 'a_128.jpg');
    const outside = path.join(outsideDir, 'a.jpg');
    expect(() =>
      assertStoredPaths(access, [{ name: 'a', originalPath: inRoot, outputs: [output(outside)] }]),
    ).toThrow(/Refused to save/);
  });

  it('keeps an old draft with a source path in originalPath saveable', () => {
    const inRoot = path.join(photosetsDir, '1', 'a_128.jpg');
    const source = path.join(outsideDir, 'DSCF0001.jpg');
    expect(() =>
      assertStoredPaths(access, [{ name: 'a', originalPath: source, outputs: [output(inRoot)] }]),
    ).not.toThrow();
  });
});

describe('photoset:showInFolder paths', () => {
  it('reveals files in the photosets folder and files main exported', () => {
    const exported = path.join(tmpDir, 'Downloads', '2026-trip.json');
    const set = new Set([exported]);
    expect(canReveal(access, path.join(photosetsDir, '1', 'a_128.jpg'), set)).toBe(true);
    expect(canReveal(access, exported, set)).toBe(true);
  });

  it('refuses anything else', () => {
    const set = new Set<string>();
    expect(canReveal(access, path.join(outsideDir, 'secret.txt'), set)).toBe(false);
    expect(canReveal(access, 'relative.jpg', set)).toBe(false);
    expect(canReveal(access, `${photosetsDir}${path.sep}..${path.sep}nubes.db`, set)).toBe(false);
  });

  it('matches exports exactly, so a traversal that normalizes to one is refused', () => {
    const downloads = path.join(tmpDir, 'Downloads');
    const exported = path.join(downloads, '2026-trip.json');
    const set = new Set([exported]);
    const sneaky = `${downloads}${path.sep}link${path.sep}..${path.sep}2026-trip.json`;
    expect(canReveal(access, sneaky, set)).toBe(false);
  });
});

describe('MediaAccess.isInRoots', () => {
  it('is lexical and rejects prefixes, traversal and the root itself', () => {
    expect(access.isInRoots(path.join(photosetsDir, 'x', 'a.json'))).toBe(true);
    expect(access.isInRoots(photosetsDir)).toBe(false);
    expect(access.isInRoots(`${photosetsDir}-evil${path.sep}a.jpg`)).toBe(false);
    expect(access.isInRoots(`${photosetsDir}${path.sep}a\0.jpg`)).toBe(false);
  });
});
