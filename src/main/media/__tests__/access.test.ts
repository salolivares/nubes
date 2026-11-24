import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mediaUrl } from '@/common/media-url';
import { isWindowsSpecialPath, isWithin, MediaAccess } from '@/main/media/access';

let tmpDir: string;
let photosetsDir: string;
let outsideDir: string;
let access: MediaAccess;

function write(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'img');
  return filePath;
}

beforeEach(() => {
  // realpath so macOS's /var -> /private/var symlink doesn't skew comparisons.
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nubes-media-test-')));
  photosetsDir = path.join(tmpDir, 'userData', 'photosets');
  outsideDir = path.join(tmpDir, 'outside');
  fs.mkdirSync(photosetsDir, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });
  access = new MediaAccess(() => [photosetsDir]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe('MediaAccess.resolve', () => {
  it('serves a file under the photosets folder', async () => {
    const file = write(path.join(photosetsDir, 'a_128.jpg'));
    expect(await access.resolve(mediaUrl(file))).toEqual({ ok: true, filePath: file });
  });

  it('serves an allowlisted picked file outside the roots', async () => {
    const file = write(path.join(outsideDir, 'IMG_0001.JPG'));
    expect(await access.allowPickedFiles([file])).toEqual([file]);
    expect(await access.resolve(mediaUrl(file))).toEqual({ ok: true, filePath: file });
  });

  it('passes the thumbnail width through and rejects other widths', async () => {
    const file = write(path.join(photosetsDir, 'a.jpg'));
    expect(await access.resolve(mediaUrl(file, { width: 200 }))).toEqual({
      ok: true,
      filePath: file,
      width: 200,
    });
    expect(await access.resolve(mediaUrl(file, { width: 5000 }))).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it('rejects an absolute path outside the roots that was never picked', async () => {
    const file = write(path.join(outsideDir, 'secret.jpg'));
    expect(await access.resolve(mediaUrl(file))).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects a sibling folder that shares the root as a prefix', async () => {
    const file = write(path.join(tmpDir, 'userData', 'photosets-evil', 'a.jpg'));
    expect(await access.resolve(mediaUrl(file))).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects .. traversal out of the photosets folder', async () => {
    write(path.join(outsideDir, 'secret.jpg'));
    // path.join would normalize the `..` away, so build the string by hand.
    const raw = `${photosetsDir}${path.sep}..${path.sep}..${path.sep}outside${path.sep}secret.jpg`;
    expect(await access.resolve(mediaUrl(raw))).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects .. even when it would land back inside the root', async () => {
    write(path.join(photosetsDir, 'a.jpg'));
    const raw = `${photosetsDir}${path.sep}x${path.sep}..${path.sep}a.jpg`;
    expect(await access.resolve(mediaUrl(raw))).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects encoded and double-encoded traversal', async () => {
    write(path.join(outsideDir, 'secret.jpg'));
    const base = `nubes-media://media/`;
    // Unencoded slashes: the URL parser folds `..`, so these must fail on shape, not luck.
    expect(await access.resolve(`${base}${photosetsDir}/../../outside/secret.jpg`)).toMatchObject({
      ok: false,
    });
    // %2e%2e with encoded separators decodes to `..` segments.
    const encodedDots =
      encodeURIComponent(`${photosetsDir}/`) + '%2e%2e%2F%2e%2e%2Foutside%2Fsecret.jpg';
    expect(await access.resolve(`${base}${encodedDots}`)).toMatchObject({
      ok: false,
      status: 403,
    });
    // Double encoding decodes once to a literal `%2e%2e`, a folder name that doesn't exist.
    const doubleEncoded = encodeURIComponent(`${photosetsDir}/%2e%2e/%2e%2e/outside/secret.jpg`);
    expect(await access.resolve(`${base}${doubleEncoded}`)).toMatchObject({ ok: false });
    // Backslash separators count as traversal too.
    const backslash = encodeURIComponent(`${photosetsDir}\\..\\..\\outside\\secret.jpg`);
    expect(await access.resolve(`${base}${backslash}`)).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects a symlink inside the root that points outside it', async () => {
    const target = write(path.join(outsideDir, 'secret.jpg'));
    const link = path.join(photosetsDir, 'link.jpg');
    fs.symlinkSync(target, link);
    expect(await access.resolve(mediaUrl(link))).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects a symlinked folder inside the root that points outside it', async () => {
    write(path.join(outsideDir, 'secret.jpg'));
    fs.symlinkSync(outsideDir, path.join(photosetsDir, 'escape'), 'dir');
    const file = path.join(photosetsDir, 'escape', 'secret.jpg');
    expect(await access.resolve(mediaUrl(file))).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects an image-named symlink to a non-image', async () => {
    const target = write(path.join(photosetsDir, 'notes.txt'));
    const link = path.join(photosetsDir, 'notes.jpg');
    fs.symlinkSync(target, link);
    expect(await access.resolve(mediaUrl(link))).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects non-image files even inside the root', async () => {
    const file = write(path.join(photosetsDir, 'nubes.db'));
    expect(await access.resolve(mediaUrl(file))).toMatchObject({ ok: false, status: 403 });
  });

  it('returns 404 for a missing file', async () => {
    const file = path.join(photosetsDir, 'missing.jpg');
    expect(await access.resolve(mediaUrl(file))).toMatchObject({ ok: false, status: 404 });
  });

  it('rejects relative paths, NUL bytes, other hosts and bad encoding', async () => {
    expect(await access.resolve(mediaUrl('photosets/a.jpg'))).toMatchObject({ status: 403 });
    expect(await access.resolve(mediaUrl(`${photosetsDir}/a.jpg\0.txt`))).toMatchObject({
      status: 400,
    });
    expect(
      await access.resolve(`nubes-media://other/${encodeURIComponent(photosetsDir)}`),
    ).toMatchObject({ status: 404 });
    expect(await access.resolve('nubes-media://media/%E0%A4%A')).toMatchObject({ status: 400 });
    expect(await access.resolve('nubes-media://media/')).toMatchObject({ status: 400 });
  });
});

describe('MediaAccess.resolve before disk access', () => {
  it('rejects a path outside the roots without calling realpath on it', async () => {
    const realpath = vi.spyOn(fsp, 'realpath');
    // On Windows this is a UNC share; realpath() on it would open an SMB connection.
    const unc = '//attacker.example/share/a.jpg';
    expect(await access.resolve(mediaUrl(unc))).toMatchObject({ ok: false, status: 403 });
    expect(realpath.mock.calls.map(([p]) => String(p))).not.toContain(unc);
    // The spy did see calls: only the trusted root was resolved.
    expect(realpath.mock.calls.map(([p]) => String(p))).toEqual([photosetsDir]);
  });

  it('rejects extra or repeated query params', async () => {
    const file = write(path.join(photosetsDir, 'a.jpg'));
    expect(await access.resolve(`${mediaUrl(file)}?w=200&x=1`)).toMatchObject({ status: 400 });
    expect(await access.resolve(`${mediaUrl(file)}?w=200&w=200`)).toMatchObject({ status: 400 });
  });
});

describe('isWindowsSpecialPath', () => {
  it('flags device paths and alternate data streams on Windows only', () => {
    expect(isWindowsSpecialPath('\\\\?\\C:\\a.jpg', '\\')).toBe(true);
    expect(isWindowsSpecialPath('\\\\.\\pipe\\a.jpg', '\\')).toBe(true);
    expect(isWindowsSpecialPath('C:\\p\\a.jpg:secret', '\\')).toBe(true);
    expect(isWindowsSpecialPath('C:\\p\\a.jpg', '\\')).toBe(false);
    expect(isWindowsSpecialPath('/p/a:b.jpg', '/')).toBe(false);
  });
});

describe('MediaAccess.allowPickedFiles', () => {
  it('skips paths with .. segments', async () => {
    write(path.join(outsideDir, 'ok.jpg'));
    const raw = `${outsideDir}${path.sep}..${path.sep}outside${path.sep}ok.jpg`;
    expect(await access.allowPickedFiles([raw])).toEqual([]);
  });

  it('skips relative paths, non-images, folders and missing files', async () => {
    const image = write(path.join(outsideDir, 'ok.png'));
    const text = write(path.join(outsideDir, 'notes.txt'));
    const folder = path.join(outsideDir, 'folder.jpg');
    fs.mkdirSync(folder);
    expect(
      await access.allowPickedFiles([
        'relative.jpg',
        text,
        folder,
        path.join(outsideDir, 'missing.jpg'),
        image,
      ]),
    ).toEqual([image]);
  });

  it('allowlists the real file behind a picked symlink, not its folder', async () => {
    const target = write(path.join(outsideDir, 'real.jpg'));
    const sibling = write(path.join(outsideDir, 'sibling.jpg'));
    const link = path.join(tmpDir, 'link.jpg');
    fs.symlinkSync(target, link);
    await access.allowPickedFiles([link]);
    expect(await access.resolve(mediaUrl(link))).toMatchObject({ ok: true, filePath: target });
    expect(await access.resolve(mediaUrl(target))).toMatchObject({ ok: true });
    expect(await access.resolve(mediaUrl(sibling))).toMatchObject({ ok: false, status: 403 });
  });
});

describe('isWithin', () => {
  it('handles prefixes, the root itself and traversal', () => {
    expect(isWithin('/a/b', '/a/b/c.jpg')).toBe(true);
    expect(isWithin('/a/b', '/a/b')).toBe(false);
    expect(isWithin('/a/b', '/a/bc/d.jpg')).toBe(false);
    expect(isWithin('/a/b', '/a/b/../c.jpg')).toBe(false);
    expect(isWithin('/a/b', '/a/b/..foo.jpg')).toBe(true);
  });
});
