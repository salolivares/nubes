import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProcessedImage } from '@/common/types';

import { parsePhotosetId } from '../../components/wizard-step';
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

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
});

describe('parsePhotosetId', () => {
  it.each([
    ['7', 7],
    ['123', 123],
    [undefined, null],
    ['', null],
    ['0', null],
    ['-1', null],
    ['1.5', null],
    ['abc', null],
    ['NaN', null],
    ['7abc', null],
    ['99999999999999999999', null],
  ])('parses %s as %s', (raw, expected) => {
    expect(parsePhotosetId(raw)).toBe(expected);
  });
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
