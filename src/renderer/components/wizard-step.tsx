import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Fragment, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';

import { paths, type WizardStepName } from '../lib/paths';
import { photosetQuery } from '../lib/photoset-queries';
import { photosetRouteParams, useRouteParams } from '../lib/route-params';
import type { PhotosetWithImages } from '../pages/PhotosetDetail/utils';
import { Button } from './ui/button';

/**
 * Navigate away and explain why in a toast. Used when a wizard step is reached without what it
 * needs, e.g. after a reload or from a stale link, or when its route params don't parse.
 */
export function WizardRedirect({ to, message }: { to: string; message?: string }) {
  useEffect(() => {
    if (message) toast.info(message, { id: `wizard-redirect:${to}` });
  }, [to, message]);
  return <Navigate to={to} replace />;
}

/**
 * Load the photoset named by the `:photosetId` route param and render the step with it.
 * Unknown or invalid ids redirect to `/new`. An uploaded photoset only shows the summary step.
 */
export function WizardStep({
  step,
  children,
}: {
  step: WizardStepName;
  children: (photoset: PhotosetWithImages) => ReactNode;
}) {
  const photosetId = useRouteParams(photosetRouteParams)?.photosetId ?? null;
  const { data, isPending, isFetching, isFetchedAfterMount, error, refetch } = useQuery({
    ...photosetQuery(photosetId ?? 0),
    enabled: photosetId !== null,
    // Steps read the row once, on mount. A refetch on window focus gains nothing, and if it failed
    // the error screen would replace the step and drop its in-progress state, such as S3Upload's
    // unsaved metadata form. Reads happen on mount, on Retry and after the step's own writes.
    refetchOnWindowFocus: false,
  });

  if (photosetId === null) {
    return (
      <WizardRedirect to={paths.newUpload()} message="Photoset not found. Start a new upload." />
    );
  }

  // Wait for a fresh read. Cached data can predate a write made elsewhere (upload, draft save,
  // delete), and acting on it would redirect the wrong way. The same goes for a cached error from
  // an earlier visit, and for Retry, which refetches without going back to pending.
  if (isPending || !isFetchedAfterMount || (error && isFetching)) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  // An error wins over cached data: rendering the step on an old row would hide that the read failed.
  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-medium text-destructive">
          {error instanceof Error ? error.message : 'Failed to load photoset'}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <WizardRedirect to={paths.newUpload()} message="Photoset not found. Start a new upload." />
    );
  }

  // An uploaded photoset can't go back through the wizard, or it would upload twice.
  if (data.uploadedAt && step !== 'summary') {
    return <WizardRedirect to={paths.wizard.summary(data.id)} />;
  }

  // Key on the id so step state (refs, retry state, form) never carries over between photosets.
  return <Fragment key={data.id}>{children(data)}</Fragment>;
}
