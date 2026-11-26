import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveAppFile } from '@/main/app-protocol/resolve';

let tmp: string;
let rendererDir: string;

beforeAll(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nubes-app-protocol-')));
  rendererDir = path.join(tmp, 'renderer', 'main_window');
  await fs.mkdir(path.join(rendererDir, 'assets'), { recursive: true });
  await fs.writeFile(path.join(rendererDir, 'index.html'), '<!doctype html>');
  await fs.writeFile(path.join(rendererDir, 'assets', 'index-abc.js'), 'export {}');
  await fs.writeFile(path.join(rendererDir, 'assets', 'a b.css'), '');
  // Files next to the bundle that must never be served.
  await fs.writeFile(path.join(tmp, 'secret.txt'), 'secret');
  await fs.mkdir(path.join(tmp, 'renderer', 'main_window-evil'));
  await fs.writeFile(path.join(tmp, 'renderer', 'main_window-evil', 'x.js'), '');
  await fs.symlink(path.join(tmp, 'secret.txt'), path.join(rendererDir, 'assets', 'link.js'));
  await fs.symlink(tmp, path.join(rendererDir, 'outside'));
});

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function served(url: string) {
  const result = await resolveAppFile(url, rendererDir);
  return result.ok ? path.relative(rendererDir, result.filePath) : null;
}

describe('resolveAppFile', () => {
  it('serves files inside the renderer folder', async () => {
    expect(await served('nubes://app/index.html')).toBe('index.html');
    expect(await served('nubes://app/')).toBe('index.html');
    expect(await served('nubes://app')).toBe('index.html');
    expect(await served('nubes://app/assets/index-abc.js')).toBe('assets/index-abc.js');
    expect(await served('nubes://app/assets/a%20b.css')).toBe('assets/a b.css');
    expect(await served('nubes://app/index.html?x=1#/settings')).toBe('index.html');
  });

  it('refuses other origins', async () => {
    for (const url of [
      'nubes://evil/index.html',
      'nubes://app:1/index.html',
      'nubes://u:p@app/index.html',
      'nubes-media://app/index.html',
      'file:///index.html',
      'not a url',
    ]) {
      expect(await served(url), url).toBeNull();
    }
  });

  it('refuses traversal and escapes', async () => {
    for (const url of [
      // The URL parser folds these to /secret.txt, which is not in the bundle.
      'nubes://app/../../secret.txt',
      'nubes://app/%2e%2e/%2e%2e/secret.txt',
      // Encoded separators survive parsing, so the decoded path is checked too.
      'nubes://app/..%2f..%2fsecret.txt',
      'nubes://app/assets%2f..%2f..%2f..%2fsecret.txt',
      'nubes://app/..%5c..%5csecret.txt',
      'nubes://app/%2e%2e%2f%2e%2e%2fmain_window-evil%2fx.js',
      'nubes://app/%2Fetc%2Fpasswd',
      'nubes://app/assets//index-abc.js',
      'nubes://app/index.html%00.js',
      'nubes://app/C:%5CWindows%5Cwin.ini',
      'nubes://app/index.html:stream',
      'nubes://app/%E0%A4%A',
    ]) {
      expect(await served(url), url).toBeNull();
    }
  });

  it('refuses symlinks that point outside the bundle', async () => {
    expect(await served('nubes://app/assets/link.js')).toBeNull();
    expect(await served('nubes://app/outside/secret.txt')).toBeNull();
  });

  it('refuses folders and missing files', async () => {
    expect(await served('nubes://app/assets')).toBeNull();
    expect(await served('nubes://app/assets/')).toBeNull();
    expect(await served('nubes://app/missing.js')).toBeNull();
  });
});
