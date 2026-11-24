import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { Button } from '../../components/ui/button';
import { photosetKeys, photosetQuery } from '../../lib/photoset-queries';
import { DraftView } from './DraftView';
import { UploadedView } from './UploadedView';

export const PhotosetDetail = () => {
  const { photosetId } = useParams<{ photosetId: string }>();
  const id = Number(photosetId);
  const queryClient = useQueryClient();
  // DraftView copies the photoset into form and table state when it mounts. Bump this after a
  // save to remount it with the saved row, so the form is clean again.
  const [draftVersion, setDraftVersion] = useState(0);
  const { data, isPending, isFetchedAfterMount, error, refetch } = useQuery({
    ...photosetQuery(id),
    enabled: !!photosetId,
  });

  const handleDraftUpdate = async () => {
    // All photoset keys: Home and Storage list this photoset too.
    await queryClient.invalidateQueries({ queryKey: photosetKeys.all });
    setDraftVersion((v) => v + 1);
  };

  // Wait for a fresh read. DraftView seeds its state from the first photoset it gets, and a cached
  // row can predate a write made elsewhere (upload, draft save, delete).
  if (isPending || (!isFetchedAfterMount && !error)) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-medium text-destructive">
          {error instanceof Error ? error.message : 'Photoset not found'}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (data.uploadedAt) {
    return <UploadedView photoset={data} />;
  }

  return <DraftView key={draftVersion} photoset={data} onUpdate={handleDraftUpdate} />;
};
