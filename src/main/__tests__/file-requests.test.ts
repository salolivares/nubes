import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isAllowedFileUrl } from '@/main/file-requests';

const rendererDir = '/app/.vite/renderer/main_window';
const url = (p: string) => pathToFileURL(p).toString();

describe('isAllowedFileUrl', () => {
  it('allows files inside the renderer folder', () => {
    expect(isAllowedFileUrl(url(`${rendererDir}/index.html`), rendererDir)).toBe(true);
    expect(isAllowedFileUrl(url(`${rendererDir}/assets/index-abc.js`), rendererDir)).toBe(true);
  });

  it('blocks files anywhere else', () => {
    expect(isAllowedFileUrl(url('/Users/me/Downloads/payload.js'), rendererDir)).toBe(false);
    expect(isAllowedFileUrl(url('/app/.vite/renderer/main_window-evil/x.js'), rendererDir)).toBe(
      false,
    );
    expect(isAllowedFileUrl(`file://${rendererDir}/../../build/index.js`, rendererDir)).toBe(false);
    expect(isAllowedFileUrl(`file://${rendererDir}/%2e%2e/%2e%2e/secret.js`, rendererDir)).toBe(
      false,
    );
    expect(isAllowedFileUrl('not a url', rendererDir)).toBe(false);
  });
});
