import { describe, expect, it, vi } from 'vitest';

import { resolveDroppedFiles } from '../dropped-files';

const file = (name: string, path = '') => ({ name, path });
const getPath = (f: { path: string }) => f.path;

describe('resolveDroppedFiles', () => {
  it('returns the files main allowed, by their path on disk', async () => {
    const allow = vi.fn(async (paths: string[]) => paths);

    const result = await resolveDroppedFiles(
      [file('a.jpg', '/photos/a.jpg'), file('b.png', '/photos/b.png')],
      getPath,
      allow,
    );

    expect(allow).toHaveBeenCalledWith(['/photos/a.jpg', '/photos/b.png']);
    expect(result).toEqual({
      entries: [
        { path: '/photos/a.jpg', name: 'a.jpg' },
        { path: '/photos/b.png', name: 'b.png' },
      ],
      missing: [],
    });
  });

  it('reports files with no path on disk as missing and never sends them to main', async () => {
    const allow = vi.fn(async (paths: string[]) => paths);

    const result = await resolveDroppedFiles(
      [file('local.jpg', '/photos/local.jpg'), file('from-browser.jpg')],
      getPath,
      allow,
    );

    expect(allow).toHaveBeenCalledWith(['/photos/local.jpg']);
    expect(result).toEqual({
      entries: [{ path: '/photos/local.jpg', name: 'local.jpg' }],
      missing: ['from-browser.jpg'],
    });
  });

  it('reports files main refused as missing', async () => {
    const result = await resolveDroppedFiles(
      [file('kept.jpg', '/photos/kept.jpg'), file('gone.jpg', '/photos/gone.jpg')],
      getPath,
      async () => ['/photos/kept.jpg'],
    );

    expect(result).toEqual({
      entries: [{ path: '/photos/kept.jpg', name: 'kept.jpg' }],
      missing: ['gone.jpg'],
    });
  });

  it('does not call main when no file has a path', async () => {
    const allow = vi.fn(async (paths: string[]) => paths);

    const result = await resolveDroppedFiles([file('a.jpg'), file('b.jpg')], getPath, allow);

    expect(allow).not.toHaveBeenCalled();
    expect(result).toEqual({ entries: [], missing: ['a.jpg', 'b.jpg'] });
  });
});
