import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Fragment, useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { photosetQuery } from '../lib/photoset-queries';
import type { PhotosetWithImages } from '../pages/PhotosetDetail/utils';
import { Button } from './ui/button';

export type WizardStepName = 'picker' | 'upload' | 's3' | 'summary';

export const wizardPath = (photosetId: number, step: WizardStepName) =>
  `/photoset/${photosetId}/${step}`;

/** Parse the `:photosetId` route param. Anything but a positive integer is `null`. */
export function parsePhotosetId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Navigate away and explain why in a toast. Used when a wizard step is reached without what it
 * needs, e.g. after a reload or from a stale link.
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
  const { photosetId: raw } = useParams<{ photosetId: string }>();
  const photosetId = parsePhotosetId(raw);
  const { data, isPending, isFetchedAfterMount, error, refetch } = useQuery({
    ...photosetQuery(photosetId ?? 0),
    enabled: photosetId !== null,
  });

  if (photosetId === null) {
    return <WizardRedirect to="/new" message="Photoset not found. Start a new upload." />;
  }

  // Wait for a fresh read. Cached data can predate a write made elsewhere (upload, draft save,
  // delete), and acting on it would redirect the wrong way.
  if (isPending || (!isFetchedAfterMount && !error)) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

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
    return <WizardRedirect to="/new" message="Photoset not found. Start a new upload." />;
  }

  // An uploaded photoset can't go back through the wizard, or it would upload twice.
  if (data.uploadedAt && step !== 'summary') {
    return <WizardRedirect to={wizardPath(data.id, 'summary')} />;
  }

  // Key on the id so step state (refs, retry state, form) never carries over between photosets.
  return <Fragment key={data.id}>{children(data)}</Fragment>;
}
