import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GitPullRequest, Loader2, RotateCw } from 'lucide-react';

import type { GitHubOpenPullRequestResult } from '@/common/types';

import { photosetKeys } from '../lib/photoset-queries';
import { Button } from './ui/button';

/** Only links to github.com, over https, open. Main's window-open handler enforces this too. */
export function isGitHubUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.origin === 'https://github.com' &&
      parsed.username === '' &&
      parsed.password === ''
    );
  } catch {
    return false;
  }
}

/** Ask main to open (or reuse) the album's PR. Throws with GitHub's readable message on failure. */
export async function openPullRequest(photosetId: number) {
  const result: GitHubOpenPullRequestResult = await window.github.openPullRequest({ photosetId });
  if (!result.ok) throw new Error(result.error);
  return result.pullRequest;
}

/**
 * The uploaded album's PR on the site repo: a link once it's open, otherwise a button to open it.
 * The images are already in S3, so this retries only the PR step.
 */
export function SitePullRequest({
  photosetId,
  pullRequestUrl,
}: {
  photosetId: number;
  pullRequestUrl: string | null;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => openPullRequest(photosetId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: photosetKeys.all }),
  });

  if (pullRequestUrl && isGitHubUrl(pullRequestUrl)) {
    return (
      <a
        href={pullRequestUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        <GitPullRequest className="h-4 w-4" />
        View site PR
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="outline"
        className="w-fit"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : mutation.isError ? (
          <RotateCw className="h-4 w-4" />
        ) : (
          <GitPullRequest className="h-4 w-4" />
        )}
        {mutation.isError ? 'Retry opening site PR' : 'Open site PR'}
      </Button>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
    </div>
  );
}
