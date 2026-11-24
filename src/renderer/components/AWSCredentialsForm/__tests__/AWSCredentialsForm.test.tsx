import { ACCESS_KEY_ID, SECRET_ACCESS_KEY } from '@common';
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

  it('starts the secret field empty and keeps the saved secret when left empty', async () => {
    vi.mocked(window.storage.secureWrite).mockClear();
    vi.mocked(window.storage.credentialsStatus).mockResolvedValueOnce({
      accessKeyId: 'AKIA1234567890ABCDEF',
      hasSecret: true,
    });
    vi.mocked(window.storage.read).mockResolvedValueOnce('us-east-1');

    const user = userEvent.setup();
    render(<AWSCredentialsForm />);

    await waitFor(() => {
      expect(screen.getByLabelText('Access Key ID')).toHaveValue('AKIA1234567890ABCDEF');
    });
    const secretInput = screen.getByLabelText('Secret Access Key');
    expect(secretInput).toHaveValue('');
    expect(secretInput).toHaveAttribute('placeholder', 'Saved. Enter a new key to replace it');

    // Change only the access key ID. The empty secret field is valid because one is saved.
    const accessKeyInput = screen.getByLabelText('Access Key ID');
    await user.clear(accessKeyInput);
    await user.type(accessKeyInput, 'AKIA0000000000ABCDEF');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(vi.mocked(window.storage.secureWrite)).toHaveBeenCalledWith(
        ACCESS_KEY_ID,
        'AKIA0000000000ABCDEF',
      );
    });
    expect(vi.mocked(window.storage.secureWrite)).not.toHaveBeenCalledWith(
      SECRET_ACCESS_KEY,
      expect.anything(),
    );
  });

  it('requires a secret when none is saved', async () => {
    const user = userEvent.setup();
    render(<AWSCredentialsForm />);

    const accessKeyInput = await screen.findByLabelText('Access Key ID');
    await user.type(accessKeyInput, 'AKIA0000000000ABCDEF');

    await waitFor(() => {
      expect(screen.getByLabelText('Access Key ID')).toHaveValue('AKIA0000000000ABCDEF');
    });
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('saves a new secret when one is entered', async () => {
    vi.mocked(window.storage.secureWrite).mockClear();
    const user = userEvent.setup();
    render(<AWSCredentialsForm />);

    await user.type(await screen.findByLabelText('Access Key ID'), 'AKIA0000000000ABCDEF');
    await user.type(
      screen.getByLabelText('Secret Access Key'),
      'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(vi.mocked(window.storage.secureWrite)).toHaveBeenCalledWith(
        SECRET_ACCESS_KEY,
        'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      );
    });
  });
});
