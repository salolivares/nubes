import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CameraEntry } from '../../hooks/useCameras';
import { CameraCombobox } from '../CameraCombobox';

afterEach(cleanup);

const cameras: CameraEntry[] = [
  { name: 'Sony A7IV', lastUsed: '2024-09-15T00:00:00Z' },
  { name: 'Canon R5', lastUsed: '2024-06-01T00:00:00Z' },
  { name: 'Fuji X-T5', lastUsed: '2024-03-10T00:00:00Z' },
];

function renderCombobox(overrides: Partial<Parameters<typeof CameraCombobox>[0]> = {}) {
  const props = {
    value: '',
    cameras,
    onSelect: vi.fn(),
    onAdd: vi.fn(),
    ...overrides,
  };
  const result = render(<CameraCombobox {...props} />);
  return { ...result, ...props };
}

describe('CameraCombobox', () => {
  it('renders trigger with placeholder when no value', () => {
    renderCombobox();
    expect(screen.getByText('Select camera')).toBeInTheDocument();
  });

  it('renders trigger with selected value', () => {
    renderCombobox({ value: 'Sony A7IV' });
    expect(screen.getByText('Sony A7IV')).toBeInTheDocument();
  });

  it('opens popover and shows camera list on click', async () => {
    const user = userEvent.setup();
    renderCombobox();

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search or add camera...')).toBeInTheDocument();
    });

    expect(screen.getByText('Sony A7IV')).toBeInTheDocument();
    expect(screen.getByText('Canon R5')).toBeInTheDocument();
    expect(screen.getByText('Fuji X-T5')).toBeInTheDocument();
  });

  it('filters cameras by query text', async () => {
    const user = userEvent.setup();
    renderCombobox();

    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search or add camera...')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search or add camera...'), 'sony');

    await waitFor(() => {
      expect(screen.getByText('Sony A7IV')).toBeInTheDocument();
      expect(screen.queryByText('Canon R5')).not.toBeInTheDocument();
      expect(screen.queryByText('Fuji X-T5')).not.toBeInTheDocument();
    });
  });

  it('calls onSelect when clicking a camera', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderCombobox();

    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Canon R5')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Canon R5'));

    expect(onSelect).toHaveBeenCalledWith('Canon R5');
  });

  it('shows add option for new camera name', async () => {
    const user = userEvent.setup();
    renderCombobox();

    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search or add camera...')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search or add camera...'), 'Leica Q3');

    await waitFor(() => {
      expect(screen.getByText(/Add "Leica Q3"/)).toBeInTheDocument();
    });
  });

  it('calls onAdd and onSelect when clicking add option', async () => {
    const user = userEvent.setup();
    const { onAdd, onSelect } = renderCombobox();

    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search or add camera...')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search or add camera...'), 'Leica Q3');
    await waitFor(() => {
      expect(screen.getByText(/Add "Leica Q3"/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add "Leica Q3"/));

    expect(onAdd).toHaveBeenCalledWith('Leica Q3');
    expect(onSelect).toHaveBeenCalledWith('Leica Q3');
  });
});
