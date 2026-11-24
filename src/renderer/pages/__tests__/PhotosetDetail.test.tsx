import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { photosetKeys } from '../../lib/photoset-queries';
import { makePhotoset, newQueryClient, renderRoutes } from '../../test-utils';
import { PhotosetDetail } from '../PhotosetDetail';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

const renderDetail = (queryClient = newQueryClient()) =>
  renderRoutes('/photoset/7', { '/photoset/:photosetId': <PhotosetDetail /> }, queryClient);

afterEach(() => {
  cleanup();
  vi.mocked(window.photosets.get).mockReset().mockResolvedValue(undefined);
  vi.mocked(window.photosets.update)
    .mockReset()
    .mockResolvedValue({} as never);
});

describe('PhotosetDetail', () => {
  it('says the photoset is not found, and retries', async () => {
    vi.mocked(window.photosets.get)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(makePhotoset({ name: 'Iceland' }));

    renderDetail();

    expect(await screen.findByText('Photoset not found')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Iceland' })).toBeInTheDocument();
  });

  it('shows a load error', async () => {
    vi.mocked(window.photosets.get).mockRejectedValueOnce(new Error('database is locked'));

    renderDetail();

    expect(await screen.findByText('database is locked')).toBeInTheDocument();
  });

  it('waits for a fresh read instead of opening a stale cached draft', async () => {
    const queryClient = newQueryClient();
    queryClient.setQueryData(photosetKeys.detail(7), makePhotoset({ name: 'Iceland' }));
    vi.mocked(window.photosets.get).mockResolvedValue(
      makePhotoset({ name: 'Iceland', uploadedAt: '2026-02-01T00:00:00.000Z' }),
    );

    renderDetail(queryClient);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(await screen.findByText(/^Uploaded /)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument();
  });

  it('reloads the draft after a save, so the form is clean again', async () => {
    vi.mocked(window.photosets.get).mockResolvedValue(
      makePhotoset({ name: 'Iceland', location: 'Reykjavik' }),
    );
    renderDetail();

    const name = await screen.findByLabelText('Album name');
    fireEvent.change(name, { target: { value: 'Iceland 2026' } });
    const save = screen.getByRole('button', { name: 'Save Draft' });
    await waitFor(() => expect(save).toBeEnabled());

    vi.mocked(window.photosets.get).mockResolvedValue(
      makePhotoset({ name: 'Iceland 2026', location: 'Reykjavik' }),
    );
    fireEvent.click(save);

    expect(await screen.findByRole('heading', { name: 'Iceland 2026' })).toBeInTheDocument();
    expect(window.photosets.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, name: 'Iceland 2026' }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled());
    expect(screen.getByLabelText('Album name')).toHaveValue('Iceland 2026');
  });
});
