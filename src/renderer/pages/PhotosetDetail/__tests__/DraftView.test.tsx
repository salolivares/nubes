import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DraftView } from '../DraftView';
import type { PhotosetWithImages } from '../utils';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

function makeDraft(overrides: Partial<PhotosetWithImages> = {}): PhotosetWithImages {
  return {
    id: 7,
    name: 'Draft',
    bucketName: 'mock-bucket',
    location: 'Lisbon',
    year: 2026,
    status: 'draft',
    uploadedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    images: [],
    ...overrides,
  } as PhotosetWithImages;
}

function renderDraft(photoset: PhotosetWithImages) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DraftView photoset={photoset} onUpdate={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function expectDeleteReachable() {
  const trigger = screen.getByRole('button', { name: 'More actions' });
  expect(trigger).toBeEnabled();
  fireEvent.click(trigger);

  const deleteItem = await screen.findByRole('menuitem', { name: /Delete Photoset/ });
  expect(deleteItem).not.toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByRole('menuitem', { name: /Upload to S3/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );

  fireEvent.click(deleteItem);
  expect(await screen.findByText('Delete photoset?')).toBeInTheDocument();
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DraftView delete', () => {
  it('can delete an unchanged draft with no processed outputs', async () => {
    renderDraft(makeDraft());

    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
    await expectDeleteReachable();
  });

  it('can delete a draft whose form is invalid (empty location)', async () => {
    renderDraft(makeDraft({ location: '' }));

    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
    await expectDeleteReachable();
  });
});

describe('DraftView add images', () => {
  it("processes picked files into this photoset's folder", async () => {
    vi.mocked(window.imagePicker.open).mockResolvedValueOnce([
      { path: '/photos/IMG_0001.jpg', name: 'IMG_0001.jpg' },
    ]);
    renderDraft(makeDraft({ id: 42 }));

    fireEvent.click(screen.getByRole('button', { name: /Add Images/ }));

    await waitFor(() =>
      expect(window.imageProcessor.resize).toHaveBeenCalledWith({
        photosetId: 42,
        imagePaths: ['/photos/IMG_0001.jpg'],
      }),
    );
  });
});
