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

describe('DraftView upload', () => {
  const unnamedImage = {
    id: 1,
    photosetId: 7,
    name: 'DSC_0042',
    camera: null,
    originalPath: '/data/photosets/7/DSC_0042_640.jpg',
    preview: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    outputs: [
      {
        id: 1,
        imageId: 1,
        imagePath: '/data/photosets/7/DSC_0042_640.jpg',
        type: 'jpg',
        resolution: 640,
        byteLength: 10,
      },
    ],
  } as PhotosetWithImages['images'][number];

  it('blocks upload while a photo still has its file name', async () => {
    renderDraft(makeDraft({ description: 'Tiles.', images: [unnamedImage] }));
    expect(screen.getByText('1 photo needs a name before upload')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Upload to S3/ }));

    // Re-query: the table re-renders its cells as new elements.
    await waitFor(() => expect(screen.getByLabelText('Photo name')).toHaveFocus());
    const input = screen.getByLabelText('Photo name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(window.s3.createAlbum).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Azulejos' } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Upload to S3/ }));

    await waitFor(() =>
      expect(window.s3.createAlbum).toHaveBeenCalledWith(
        expect.objectContaining({ images: [expect.objectContaining({ name: 'Azulejos' })] }),
      ),
    );
  });
});
