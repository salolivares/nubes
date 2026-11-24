import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeListRow, renderRoutes } from '../../test-utils';
import { Home } from '../Home';

const renderHome = () => renderRoutes('/', { '/': <Home /> });

afterEach(() => {
  cleanup();
  vi.mocked(window.photosets.list).mockReset().mockResolvedValue([]);
});

describe('Home', () => {
  it('lists photosets newest first', async () => {
    vi.mocked(window.photosets.list).mockResolvedValue([makeListRow({ name: 'Iceland' })]);

    renderHome();

    expect(await screen.findByText('Iceland')).toBeInTheDocument();
    expect(window.photosets.list).toHaveBeenCalledWith({ sortBy: 'createdAt', sortOrder: 'desc' });
  });

  it('shows the empty state when there are no photosets', async () => {
    renderHome();

    expect(await screen.findByText('No photosets yet')).toBeInTheDocument();
  });

  it('shows the error and retries', async () => {
    let resolveRetry!: (rows: ReturnType<typeof makeListRow>[]) => void;
    vi.mocked(window.photosets.list)
      .mockRejectedValueOnce(new Error('database is locked'))
      .mockReturnValueOnce(new Promise((resolve) => (resolveRetry = resolve)));

    renderHome();

    expect(await screen.findByText('database is locked')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Loading...')).toBeInTheDocument();
    resolveRetry([makeListRow({ name: 'Iceland' })]);
    expect(await screen.findByText('Iceland')).toBeInTheDocument();
  });

  it('keeps the current list on screen while another sort order loads', async () => {
    vi.mocked(window.photosets.list).mockResolvedValueOnce([makeListRow({ name: 'Iceland' })]);
    let resolveByName!: (rows: ReturnType<typeof makeListRow>[]) => void;
    vi.mocked(window.photosets.list).mockReturnValueOnce(
      new Promise((resolve) => (resolveByName = resolve)),
    );

    renderHome();
    expect(await screen.findByText('Iceland')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Date created/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Name' }));

    await waitFor(() =>
      expect(window.photosets.list).toHaveBeenLastCalledWith({ sortBy: 'name', sortOrder: 'asc' }),
    );
    expect(screen.getByText('Iceland')).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();

    resolveByName([makeListRow({ id: 2, name: 'Alps' })]);
    expect(await screen.findByText('Alps')).toBeInTheDocument();
  });
});
