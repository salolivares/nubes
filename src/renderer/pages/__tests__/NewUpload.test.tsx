import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NewUpload } from '../NewUpload';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NewUpload />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.mocked(window.s3.isMock).mockResolvedValue(false);
  vi.mocked(window.s3.listBuckets).mockResolvedValue([]);
});

describe('NewUpload', () => {
  it('asks for AWS credentials when none are saved and S3 is real', async () => {
    renderPage();

    expect(await screen.findByText('AWS credentials required')).toBeInTheDocument();
    expect(window.s3.listBuckets).not.toHaveBeenCalled();
  });

  it('lists mock buckets without AWS credentials when mock S3 is on', async () => {
    vi.mocked(window.s3.isMock).mockResolvedValue(true);
    vi.mocked(window.s3.listBuckets).mockResolvedValue([{ Name: 'mock-photos-bucket' }]);

    renderPage();

    expect(await screen.findByText('mock-photos-bucket')).toBeInTheDocument();
    expect(screen.queryByText('AWS credentials required')).not.toBeInTheDocument();
  });
});
