import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProcessedImage } from '@/common/types';

import { photosetKeys } from '../../lib/photoset-queries';
import { useImageStore } from '../../stores/images';
import { ImagePicker } from '../ImagePicker';
import { ImageProcessing } from '../ImageProcessing';
import type { PhotosetWithImages } from '../PhotosetDetail/utils';
import { S3Summary } from '../S3Summary';
import { S3Upload } from '../S3Upload';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

const newQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderAt(path: string, queryClient = newQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[path]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/photoset/:photosetId/picker" element={<ImagePicker />} />
          <Route path="/photoset/:photosetId/upload" element={<ImageProcessing />} />
          <Route path="/photoset/:photosetId/s3" element={<S3Upload />} />
          <Route path="/photoset/:photosetId/summary" element={<S3Summary />} />
          <Route path="*" element={null} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function expectLocation(pathname: string) {
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(pathname));
}

function makePhotoset(overrides: Partial<PhotosetWithImages> = {}): PhotosetWithImages {
  return {
    id: 7,
    name: 'Upload',
    bucketName: 'mock-bucket',
    location: '',
    year: 2026,
    status: 'draft',
    uploadedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    images: [],
    ...overrides,
  } as PhotosetWithImages;
}

const dbImage = {
  id: 1,
  photosetId: 7,
  name: 'a.jpg',
  camera: null,
  originalPath: '/tmp/a.jpg',
  preview: null,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  outputs: [
    {
      id: 1,
      imageId: 1,
      imagePath: '/tmp/a-640.jpg',
      type: 'jpg',
      resolution: 640,
      byteLength: 10,
    },
  ],
} as PhotosetWithImages['images'][number];

const processedImage: ProcessedImage = {
  id: 'img-1',
  name: 'a.jpg',
  imagePaths: [{ imagePath: '/tmp/a-640.jpg', type: 'jpg', resolution: 640, byteLength: 10 }],
} as ProcessedImage;

beforeEach(() => {
  useImageStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(window.photosets.get).mockResolvedValue(undefined);
  vi.mocked(window.imagePicker.addDroppedFiles).mockResolvedValue({ entries: [], missing: [] });
});

describe('wizard steps', () => {
  it.each(['abc', '0', '-3'])('redirects an invalid photoset id (%s) to /new', async (id) => {
    renderAt(`/photoset/${id}/picker`);

    await expectLocation('/new');
    expect(window.photosets.get).not.toHaveBeenCalled();
  });

  it.each(['picker', 'upload', 's3', 'summary'])(
    'redirects an unknown photoset on the %s step to /new',
    async (step) => {
      renderAt(`/photoset/404/${step}`);

      await expectLocation('/new');
      expect(window.photosets.get).toHaveBeenCalledWith({ id: 404 });
    },
  );

  it('renders the picker for a known photoset', async () => {
    vi.mocked(window.photosets.get).mockResolvedValue(makePhotoset());

    renderAt('/photoset/7/picker');

    expect(await screen.findByText('Drag and drop files here')).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toBe('/photoset/7/picker');
  });

  it('sends an uploaded photoset to the summary instead of back through the wizard', async () => {
    vi.mocked(window.photosets.get).mockResolvedValue(
      makePhotoset({ uploadedAt: '2026-01-02T00:00:00.000Z', images: [dbImage] }),
    );

    renderAt('/photoset/7/s3');

    await expectLocation('/photoset/7/summary');
    expect(await screen.findByText('Album Uploaded')).toBeInTheDocument();
  });

  it('processing with no picked files goes back to the picker without starting the worker', async () => {
    vi.mocked(window.photosets.get).mockResolvedValue(makePhotoset());

    renderAt('/photoset/7/upload');

    await expectLocation('/photoset/7/picker');
    expect(window.imageProcessor.resize).not.toHaveBeenCalled();
  });

  it('processing after a reload skips ahead when the DB already has images', async () => {
    vi.mocked(window.photosets.get).mockResolvedValue(makePhotoset({ images: [dbImage] }));

    renderAt('/photoset/7/upload');

    await expectLocation('/photoset/7/s3');
    expect(window.imageProcessor.resize).not.toHaveBeenCalled();
    expect(await screen.findByText('Review & Upload')).toBeInTheDocument();
    // The S3 step reloaded the processed images from the DB.
    expect(useImageStore.getState().processedImages).toHaveLength(1);
  });

  it('S3 step with no processed images anywhere goes back to the picker', async () => {
    vi.mocked(window.photosets.get).mockResolvedValue(makePhotoset());

    renderAt('/photoset/7/s3');

    await expectLocation('/photoset/7/picker');
  });

  it('summary of a photoset that was never uploaded opens its detail page', async () => {
    vi.mocked(window.photosets.get).mockResolvedValue(makePhotoset({ images: [dbImage] }));

    renderAt('/photoset/7/summary');

    await expectLocation('/photoset/7');
    expect(screen.queryByText('Album Uploaded')).not.toBeInTheDocument();
  });
});

describe('wizard step read errors', () => {
  const pickerText = 'Drag and drop files here';

  function deferredPhotoset() {
    let resolve!: (p: PhotosetWithImages) => void;
    vi.mocked(window.photosets.get).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    return (p: PhotosetWithImages) => resolve(p);
  }

  // A refetch with no cached row clears the error and goes back to pending. The cases below need a
  // cached row with a failed read on top of it: a step that loaded once, then failed to reload.
  async function failReadOverCachedRow(queryClient = newQueryClient()) {
    queryClient.setQueryData(photosetKeys.detail(7), makePhotoset());
    vi.mocked(window.photosets.get).mockRejectedValueOnce(new Error('database is locked'));
    const view = renderAt('/photoset/7/picker', queryClient);
    expect(await screen.findByText('database is locked')).toBeInTheDocument();
    return { queryClient, view };
  }

  it('shows the error, not the step, when a read fails with a cached row', async () => {
    await failReadOverCachedRow();

    expect(screen.queryByText(pickerText)).not.toBeInTheDocument();
  });

  it('does not flash a cached error from an earlier visit while it reads again', async () => {
    const { queryClient, view } = await failReadOverCachedRow();
    view.unmount();

    const resolve = deferredPhotoset();
    renderAt('/photoset/7/picker', queryClient);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('database is locked')).not.toBeInTheDocument();
    resolve(makePhotoset());
    expect(await screen.findByText(pickerText)).toBeInTheDocument();
  });

  it('shows Loading while Retry reads again', async () => {
    await failReadOverCachedRow();

    const resolve = deferredPhotoset();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('database is locked')).not.toBeInTheDocument();
    expect(screen.queryByText(pickerText)).not.toBeInTheDocument();
    resolve(makePhotoset());
    expect(await screen.findByText(pickerText)).toBeInTheDocument();
  });

  it('does not refetch the row when the window regains focus', async () => {
    vi.mocked(window.photosets.get).mockResolvedValue(makePhotoset());
    renderAt('/photoset/7/picker');
    expect(await screen.findByText(pickerText)).toBeInTheDocument();
    expect(window.photosets.get).toHaveBeenCalledTimes(1);

    focusManager.setFocused(false);
    focusManager.setFocused(true);
    focusManager.setFocused(undefined);

    await new Promise((r) => setTimeout(r, 0));
    expect(window.photosets.get).toHaveBeenCalledTimes(1);
    expect(screen.getByText(pickerText)).toBeInTheDocument();
  });
});

describe('image picker', () => {
  it('clears results from an earlier run before processing a new pick', async () => {
    vi.mocked(window.photosets.get).mockResolvedValue(makePhotoset());
    const file = Object.assign(new File([], 'b.jpg'), { path: '/tmp/b.jpg' });
    useImageStore.getState().addFiles([file]);
    useImageStore.getState().setProcessed(true);
    useImageStore.getState().setProcessedImages([processedImage]);

    renderAt('/photoset/7/picker');
    fireEvent.click(await screen.findByRole('button', { name: 'Upload' }));

    await expectLocation('/photoset/7/upload');
    expect(useImageStore.getState().processedImages).toEqual([]);
    await waitFor(() =>
      expect(window.imageProcessor.resize).toHaveBeenCalledWith({ imagePaths: ['/tmp/b.jpg'] }),
    );
  });

  async function dropOnPicker(files: File[]) {
    renderAt('/photoset/7/picker');
    fireEvent.drop(await screen.findByTestId('drop-zone'), {
      dataTransfer: { files, types: ['Files'] },
    });
  }

  it('queues a dropped file under its path on disk and processes it from there', async () => {
    vi.mocked(window.photosets.get).mockResolvedValue(makePhotoset());
    vi.mocked(window.imagePicker.addDroppedFiles).mockResolvedValue({
      entries: [{ path: '/Users/me/Photos/a.jpg', name: 'a.jpg' }],
      missing: [],
    });
    const dropped = new File(['jpg'], 'a.jpg', { type: 'image/jpeg' });

    await dropOnPicker([dropped]);

    await waitFor(() => expect(useImageStore.getState().files).toHaveLength(1));
    expect(window.imagePicker.addDroppedFiles).toHaveBeenCalledWith([dropped]);
    expect(useImageStore.getState().files[0].path).toBe('/Users/me/Photos/a.jpg');
    expect(useImageStore.getState().files[0].preview).toMatch(/^nubes-media:/);

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() =>
      expect(window.imageProcessor.resize).toHaveBeenCalledWith({
        imagePaths: ['/Users/me/Photos/a.jpg'],
      }),
    );
  });

  it('rejects a dropped file with no path on disk and says why', async () => {
    vi.mocked(window.photosets.get).mockResolvedValue(makePhotoset());
    vi.mocked(window.imagePicker.addDroppedFiles).mockResolvedValue({
      entries: [{ path: '/Users/me/Photos/local.jpg', name: 'local.jpg' }],
      missing: ['from-browser.jpg'],
    });

    await dropOnPicker([
      new File(['jpg'], 'local.jpg', { type: 'image/jpeg' }),
      new File(['jpg'], 'from-browser.jpg', { type: 'image/jpeg' }),
    ]);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't add from-browser.jpg",
        expect.objectContaining({ description: expect.stringContaining('saved on this computer') }),
      ),
    );
    expect(useImageStore.getState().files.map((f) => f.path)).toEqual([
      '/Users/me/Photos/local.jpg',
    ]);
  });

  it('counts the rejected files when several have no path on disk', async () => {
    vi.mocked(window.photosets.get).mockResolvedValue(makePhotoset());
    vi.mocked(window.imagePicker.addDroppedFiles).mockResolvedValue({
      entries: [],
      missing: ['one.jpg', 'two.jpg'],
    });

    await dropOnPicker([
      new File(['jpg'], 'one.jpg', { type: 'image/jpeg' }),
      new File(['jpg'], 'two.jpg', { type: 'image/jpeg' }),
    ]);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't add 2 images", expect.anything()),
    );
    expect(useImageStore.getState().files).toEqual([]);
  });

  it('skips dropped files that are not JPG or PNG and says so', async () => {
    vi.mocked(window.photosets.get).mockResolvedValue(makePhotoset());

    await dropOnPicker([new File(['pdf'], 'notes.pdf', { type: 'application/pdf' })]);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Skipped notes.pdf', {
        description: 'Only JPG and PNG images can be added.',
      }),
    );
    expect(window.imagePicker.addDroppedFiles).not.toHaveBeenCalled();
    expect(useImageStore.getState().files).toEqual([]);
  });
});

describe('S3 upload', () => {
  async function fillAndUpload() {
    fireEvent.change(await screen.findByPlaceholderText('My awesome album'), {
      target: { value: 'Trip' },
    });
    fireEvent.change(screen.getByPlaceholderText('Los Angeles, California'), {
      target: { value: 'Tokyo' },
    });
    const trigger = document.querySelector<HTMLElement>('[aria-haspopup="menu"]')!;
    await waitFor(() => expect(trigger).not.toBeDisabled());
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByText('Upload to S3'));
  }

  beforeEach(() => {
    useImageStore.getState().setProcessedImages([processedImage]);
    vi.mocked(window.photosets.get).mockResolvedValue(makePhotoset({ images: [dbImage] }));
  });

  it('uses the bucket from the photoset row and records the upload in the DB', async () => {
    renderAt('/photoset/7/s3');
    await fillAndUpload();

    await expectLocation('/photoset/7/summary');
    expect(window.s3.createAlbum).toHaveBeenCalledWith(
      expect.objectContaining({ bucketName: 'mock-bucket' }),
    );
    expect(window.photosets.markUploaded).toHaveBeenCalledWith({ id: 7 });
    expect(toast.success).toHaveBeenCalledWith('Album uploaded to S3');
  });

  it('does not touch the DB when S3 reports a failed upload', async () => {
    vi.mocked(window.s3.createAlbum).mockResolvedValueOnce({ success: false });

    renderAt('/photoset/7/s3');
    await fillAndUpload();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Upload to S3 failed')),
    );
    expect(window.photosets.addImages).not.toHaveBeenCalled();
    expect(window.photosets.markUploaded).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByTestId('location').textContent).toBe('/photoset/7/s3');
  });

  it('marks the photoset uploaded only after publishing it', async () => {
    renderAt('/photoset/7/s3');
    await screen.findByPlaceholderText('My awesome album');
    fireEvent.click(document.getElementById('published')!);
    await fillAndUpload();

    await expectLocation('/photoset/7/summary');
    const publishOrder = vi.mocked(window.photosets.publish).mock.invocationCallOrder[0];
    const markOrder = vi.mocked(window.photosets.markUploaded).mock.invocationCallOrder[0];
    expect(publishOrder).toBeLessThan(markOrder);
  });

  it('surfaces a failed DB update after S3 succeeds and lets the user retry it', async () => {
    vi.mocked(window.photosets.markUploaded).mockRejectedValueOnce(new Error('database is locked'));

    renderAt('/photoset/7/s3');
    await fillAndUpload();

    expect(await screen.findByRole('alert')).toHaveTextContent('database is locked');
    expect(toast.error).toHaveBeenCalledWith(
      'Album uploaded to S3, but the local database was not updated',
      { description: 'database is locked' },
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByTestId('location').textContent).toBe('/photoset/7/s3');

    fireEvent.click(screen.getByText('Retry database update'));

    await expectLocation('/photoset/7/summary');
    expect(window.s3.createAlbum).toHaveBeenCalledTimes(1);
    expect(window.photosets.markUploaded).toHaveBeenCalledTimes(2);
  });
});
