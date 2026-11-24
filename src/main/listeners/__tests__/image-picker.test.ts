import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { IMAGE_PICKER_ALLOW_DROPPED } from '@/common/constants';
import { addImagePickerEventListeners } from '@/main/listeners/image-picker';

const electron = vi.hoisted(() => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn(() => ({ isDestroyed: () => false })) },
  dialog: { showOpenDialog: vi.fn() },
}));
const media = vi.hoisted(() => ({
  allowPickedFiles: vi.fn(async (paths: string[]) => paths),
}));

vi.mock('electron', () => electron);
vi.mock('electron-log/main', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { default: { scope: () => log } };
});
vi.mock('@/main/media', () => media);

const mainFrame = { url: 'file:///app/renderer/main_window/index.html', parent: null };
const trustedEvent = { sender: { mainFrame }, senderFrame: mainFrame };

function invoke(channel: string, args: unknown) {
  const call = electron.ipcMain.handle.mock.calls.find(([name]) => name === channel);
  if (!call) throw new Error(`No handler registered for ${channel}`);
  return (call[1] as (event: unknown, args: unknown) => Promise<unknown>)(trustedEvent, args);
}

beforeAll(() => {
  // isTrustedSender() compares the sender's URL with the Forge dev server URL.
  vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', undefined);
  addImagePickerEventListeners();
});

beforeEach(() => {
  media.allowPickedFiles.mockClear();
});

describe('IMAGE_PICKER_ALLOW_DROPPED', () => {
  it('adds dropped paths to the media allowlist and returns the ones it accepted', async () => {
    media.allowPickedFiles.mockResolvedValueOnce(['/Users/me/a.jpg']);

    const accepted = await invoke(IMAGE_PICKER_ALLOW_DROPPED, [
      '/Users/me/a.jpg',
      '/Users/me/notes.txt',
    ]);

    expect(media.allowPickedFiles).toHaveBeenCalledWith(['/Users/me/a.jpg', '/Users/me/notes.txt']);
    expect(accepted).toEqual(['/Users/me/a.jpg']);
  });

  it('never passes UNC paths on, so resolving them cannot open an SMB connection', async () => {
    await invoke(IMAGE_PICKER_ALLOW_DROPPED, [
      '\\\\attacker.example\\share\\a.jpg',
      '//attacker.example/share/b.jpg',
      'C:\\Users\\me\\c.jpg',
    ]);

    expect(media.allowPickedFiles).toHaveBeenCalledWith(['C:\\Users\\me\\c.jpg']);
  });

  it.each([
    ['a single string', '/Users/me/a.jpg'],
    ['a non-string entry', ['/Users/me/a.jpg', 42]],
    ['an empty path', ['']],
    ['too many paths', Array.from({ length: 10_001 }, (_, i) => `/p/${i}.jpg`)],
  ])('rejects %s without touching the allowlist', async (_, args) => {
    await expect(invoke(IMAGE_PICKER_ALLOW_DROPPED, args)).rejects.toThrow();
    expect(media.allowPickedFiles).not.toHaveBeenCalled();
  });
});
