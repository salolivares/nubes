import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AWSCredentialsForm } from '../AWSCredentialsForm';

afterEach(cleanup);

describe('AWSCredentialsForm', () => {
  it('renders all fields', async () => {
    render(<AWSCredentialsForm />);

    await waitFor(() => {
      expect(screen.getByLabelText('Access Key ID')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Secret Access Key')).toBeInTheDocument();
    expect(screen.getByLabelText('Region')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('disables save when fields are empty', async () => {
    render(<AWSCredentialsForm />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    });
  });

  it('shows validation error for invalid access key format', async () => {
    const user = userEvent.setup();
    render(<AWSCredentialsForm />);

    const accessKeyInput = await screen.findByLabelText('Access Key ID');
    await user.click(accessKeyInput);
    await user.type(accessKeyInput, 'invalid-key');
    await user.tab(); // trigger blur/onChange validation

    await waitFor(() => {
      expect(screen.getByText('Invalid AWS Access Key ID format')).toBeInTheDocument();
    });
  });

  it('shows validation error for invalid secret key format', async () => {
    const user = userEvent.setup();
    render(<AWSCredentialsForm />);

    const secretKeyInput = await screen.findByLabelText('Secret Access Key');
    await user.click(secretKeyInput);
    await user.type(secretKeyInput, 'short');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText('Invalid AWS Secret Access Key format')).toBeInTheDocument();
    });
  });

  it('enables save and calls storage on valid submit', async () => {
    // Pre-populate credentials so form loads with valid values already dirty
    vi.mocked(window.storage.secureRead)
      .mockResolvedValueOnce('AKIA1234567890ABCDEF')   // accessKeyId
      .mockResolvedValueOnce('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'); // secretAccessKey
    vi.mocked(window.storage.read).mockResolvedValueOnce('us-east-1');

    const user = userEvent.setup();
    render(<AWSCredentialsForm />);

    // Wait for credentials to load
    await waitFor(() => {
      expect(screen.getByLabelText('Access Key ID')).toHaveValue('AKIA1234567890ABCDEF');
    });

    // Make a small edit to dirty the form
    const accessKeyInput = screen.getByLabelText('Access Key ID');
    await user.clear(accessKeyInput);
    await user.type(accessKeyInput, 'AKIA0000000000ABCDEF');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(vi.mocked(window.storage.secureWrite)).toHaveBeenCalledWith(
        expect.any(String),
        'AKIA0000000000ABCDEF',
      );
    });
  });
});
