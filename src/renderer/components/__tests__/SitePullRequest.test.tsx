import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { newQueryClient } from '../../test-utils';
import { isGitHubUrl, SitePullRequest } from '../SitePullRequest';

function renderPr(pullRequestUrl: string | null) {
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <SitePullRequest photosetId={7} pullRequestUrl={pullRequestUrl} />
    </QueryClientProvider>,
  );
}

describe('SitePullRequest', () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(window.github.openPullRequest).mockReset();
  });

  it('links to the open PR in the browser', () => {
    renderPr('https://github.com/salolivares/salolivares.com/pull/12');
    const link = screen.getByRole('link', { name: /view site pr/i });
    expect(link).toHaveAttribute('href', 'https://github.com/salolivares/salolivares.com/pull/12');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('retries just the PR step and shows why it failed', async () => {
    vi.mocked(window.github.openPullRequest).mockResolvedValue({
      ok: false,
      error: "The token can't open a pull request in o/r.",
    });
    renderPr(null);

    fireEvent.click(screen.getByRole('button', { name: 'Open site PR' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("can't open a pull request");
    expect(screen.getByRole('button', { name: 'Retry opening site PR' })).toBeEnabled();
    expect(window.github.openPullRequest).toHaveBeenCalledWith({ photosetId: 7 });
  });

  it('never links anywhere but github.com over https', () => {
    expect(isGitHubUrl('https://github.com/o/r/pull/1')).toBe(true);
    for (const url of [
      'http://github.com/o/r/pull/1',
      'https://evil@github.com/o/r',
      'https://github.com.evil.dev/o/r',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(isGitHubUrl(url)).toBe(false);
    }
    renderPr('https://example.com/pull/1');
    expect(screen.queryByRole('link')).toBeNull();
  });
});
