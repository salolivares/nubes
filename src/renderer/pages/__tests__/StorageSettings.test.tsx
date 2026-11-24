import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { photosetKeys } from '../../lib/photoset-queries';
import { makeListRow, renderRoutes } from '../../test-utils';
import { StorageSettings } from '../StorageSettings';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

const uploaded = makeListRow({ id: 1, name: 'Iceland', uploadedAt: '2026-02-01T00:00:00.000Z' });
const draft = makeListRow({ id: 2, name: 'Alps' });

beforeEach(() => {
  window.cache = {
    getUsage: vi.fn().mockResolvedValue({ totalBytes: 2048, fileCount: 2 }),
  } as unknown as Window['cache'];
  vi.mocked(window.photosets.list).mockResolvedValue([uploaded, draft]);
});

afterEach(() => {
  cleanup();
  vi.mocked(window.photosets.list).mockReset().mockResolvedValue([]);
  vi.mocked(window.photosets.delete).mockReset().mockResolvedValue(undefined);
});

async function confirmDelete(name: string) {
  const row = (await screen.findByText(name)).closest('li')!;
  fireEvent.click(within(row).getByRole('button'));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
}

describe('StorageSettings', () => {
  it('shows cache usage and only uploaded photosets', async () => {
    renderRoutes('/', { '/': <StorageSettings /> });

    expect(await screen.findByText('2 KB across 2 files')).toBeInTheDocument();
    expect(await screen.findByText('Iceland')).toBeInTheDocument();
    expect(screen.queryByText('Alps')).not.toBeInTheDocument();
  });

  it('deletes a photoset, then reloads the list and the usage', async () => {
    const { queryClient } = renderRoutes('/', { '/': <StorageSettings /> });
    await screen.findByText('Iceland');

    vi.mocked(window.photosets.list).mockResolvedValue([draft]);
    vi.mocked(window.cache.getUsage).mockResolvedValue({ totalBytes: 0, fileCount: 0 });
    await confirmDelete('Iceland');

    expect(window.photosets.delete).toHaveBeenCalledWith({ id: 1 });
    expect(await screen.findByText('No uploaded photosets to clean up.')).toBeInTheDocument();
    expect(await screen.findByText('0 B across 0 files')).toBeInTheDocument();
    // Home's default sort shares this list, so it no longer holds the deleted row either.
    const cached = queryClient.getQueryData<{ id: number }[]>(
      photosetKeys.list({ sortBy: 'createdAt', sortOrder: 'desc' }),
    );
    expect(cached?.map((p) => p.id)).toEqual([2]);
  });

  it('reports a failed delete and reloads from disk', async () => {
    renderRoutes('/', { '/': <StorageSettings /> });
    await screen.findByText('Iceland');
    vi.mocked(window.photosets.delete).mockRejectedValueOnce(new Error('EBUSY'));
    const listCalls = vi.mocked(window.photosets.list).mock.calls.length;

    await confirmDelete('Iceland');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to delete', { description: 'EBUSY' }),
    );
    await waitFor(() =>
      expect(vi.mocked(window.photosets.list).mock.calls.length).toBeGreaterThan(listCalls),
    );
    expect(screen.getByText('Iceland')).toBeInTheDocument();
  });
});
