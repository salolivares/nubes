import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { PhotosetWithImages } from './pages/PhotosetDetail/utils';

export type PhotosetListRow = Awaited<ReturnType<Window['photosets']['list']>>[number];

export function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

/** Render `routes` under a router at `path`, with a fresh (or given) QueryClient. */
export function renderRoutes(
  path: string,
  routes: Record<string, ReactNode>,
  queryClient: QueryClient = newQueryClient(),
) {
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[path]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          {Object.entries(routes).map(([p, element]) => (
            <Route key={p} path={p} element={element} />
          ))}
          <Route path="*" element={null} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

export function makeListRow(overrides: Partial<PhotosetListRow> = {}): PhotosetListRow {
  return {
    id: 1,
    name: 'Photoset',
    bucketName: 'mock-bucket',
    location: '',
    description: '',
    year: 2026,
    month: null,
    status: 'draft',
    uploadedAt: null,
    pullRequestUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    images: [],
    ...overrides,
  } as PhotosetListRow;
}

export function makePhotoset(overrides: Partial<PhotosetWithImages> = {}): PhotosetWithImages {
  return {
    id: 7,
    name: 'Upload',
    bucketName: 'mock-bucket',
    location: '',
    description: '',
    year: 2026,
    month: null,
    status: 'draft',
    uploadedAt: null,
    pullRequestUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    images: [],
    ...overrides,
  } as PhotosetWithImages;
}
