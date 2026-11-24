import { CAMERAS_STORAGE_KEY } from '@common';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { newQueryClient } from '../../test-utils';
import { useCameras } from '../useCameras';

const stored = (names: string[]) =>
  JSON.stringify(names.map((name) => ({ name, lastUsed: '2026-01-01T00:00:00.000Z' })));

function renderCameras() {
  const queryClient = newQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const a = renderHook(() => useCameras(), { wrapper });
  const b = renderHook(() => useCameras(), { wrapper });
  return { a, b };
}

afterEach(() => {
  vi.mocked(window.storage.read).mockReset().mockResolvedValue('');
  vi.mocked(window.storage.write).mockReset().mockResolvedValue(undefined);
});

describe('useCameras', () => {
  it('loads saved cameras and the sort mode', async () => {
    vi.mocked(window.storage.read).mockImplementation(async (key) =>
      key === CAMERAS_STORAGE_KEY ? stored(['Canon R5']) : 'custom',
    );
    const { a } = renderCameras();

    expect(a.result.current.loaded).toBe(false);
    await waitFor(() => expect(a.result.current.loaded).toBe(true));
    expect(a.result.current.cameras.map((c) => c.name)).toEqual(['Canon R5']);
    expect(a.result.current.sortMode).toBe('custom');
  });

  it('shares writes between components', async () => {
    const { a, b } = renderCameras();
    await waitFor(() => expect(b.result.current.loaded).toBe(true));

    await act(() => a.result.current.addCamera('Fuji X-T5'));

    // React Query notifies observers on a timer, so wait for the re-render.
    await waitFor(() => expect(b.result.current.cameras.map((c) => c.name)).toEqual(['Fuji X-T5']));
    expect(window.storage.write).toHaveBeenLastCalledWith(
      CAMERAS_STORAGE_KEY,
      expect.stringContaining('Fuji X-T5'),
    );
  });

  it('keeps both of two writes made in the same tick', async () => {
    const { a } = renderCameras();
    await waitFor(() => expect(a.result.current.loaded).toBe(true));

    // What the combobox does: add a camera, then select (touch) another before the add settles.
    await act(async () => {
      void a.result.current.addCamera('Fuji X-T5');
      await a.result.current.touchCamera('Sony A7IV');
    });

    await waitFor(() =>
      expect(a.result.current.rawCameras.map((c) => c.name)).toEqual(['Fuji X-T5', 'Sony A7IV']),
    );
  });

  it('keeps a write made while the first load is still in flight', async () => {
    let finishLoad!: (raw: string) => void;
    vi.mocked(window.storage.read).mockImplementation((key) =>
      key === CAMERAS_STORAGE_KEY ? new Promise((r) => (finishLoad = r)) : Promise.resolve(''),
    );
    const { a } = renderCameras();
    await waitFor(() => expect(window.storage.read).toHaveBeenCalledWith(CAMERAS_STORAGE_KEY));

    let added!: Promise<void>;
    act(() => {
      added = a.result.current.addCamera('Fuji X-T5');
    });
    finishLoad(stored(['Canon R5']));
    await act(() => added);

    await waitFor(() =>
      expect(a.result.current.rawCameras.map((c) => c.name)).toEqual(['Canon R5', 'Fuji X-T5']),
    );
    expect(window.storage.write).toHaveBeenLastCalledWith(
      CAMERAS_STORAGE_KEY,
      expect.stringMatching(/Canon R5.*Fuji X-T5/),
    );
  });

  it('reloads from disk when a write fails', async () => {
    vi.mocked(window.storage.read).mockImplementation(async (key) =>
      key === CAMERAS_STORAGE_KEY ? stored(['Canon R5']) : '',
    );
    vi.mocked(window.storage.write).mockRejectedValueOnce(new Error('EACCES'));
    const { a } = renderCameras();
    await waitFor(() => expect(a.result.current.loaded).toBe(true));

    await act(() => a.result.current.addCamera('Fuji X-T5').catch(() => {}));

    await waitFor(() =>
      expect(a.result.current.rawCameras.map((c) => c.name)).toEqual(['Canon R5']),
    );
  });
});
