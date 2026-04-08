import { zodResolver } from '@hookform/resolvers/zod';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FC } from 'react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Album } from '@/common/types';
import { albumSchema } from '@/common/types';

import { AlbumForm } from '../AlbumForm';

afterEach(cleanup);

const Wrapper: FC<{ onSubmit?: (data: Album) => void }> = ({ onSubmit = vi.fn() }) => {
  const form = useForm({
    resolver: zodResolver(albumSchema),
    defaultValues: { name: '', location: '', year: 2024, published: false },
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <AlbumForm form={form} />
      <button type="submit">Submit</button>
    </form>
  );
};

describe('AlbumForm', () => {
  it('renders all fields', () => {
    render(<Wrapper />);

    expect(screen.getByLabelText('Album name')).toBeInTheDocument();
    expect(screen.getByLabelText('Location')).toBeInTheDocument();
    expect(screen.getByLabelText('Year')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('blocks submit when required fields are empty', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Wrapper onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: /submit/i }));

    // Give react-hook-form time to process
    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it('blocks submit when name exceeds 50 chars', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Wrapper onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Album name'), 'A'.repeat(51));
    await user.type(screen.getByLabelText('Location'), 'Paris');
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it('calls onSubmit with correct Album shape on valid input', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Wrapper onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Album name'), 'Vacation');
    await user.type(screen.getByLabelText('Location'), 'Paris');

    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Vacation',
          location: 'Paris',
          year: 2024,
          published: false,
        }),
        expect.anything(),
      );
    });
  });
});
