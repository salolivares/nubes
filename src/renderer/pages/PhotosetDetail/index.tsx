import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { Button } from '../../components/ui/button';
import { photosetKeys, photosetQuery } from '../../lib/photoset-queries';
import { DraftView } from './DraftView';
import { UploadedView } from './UploadedView';

const Loading = () => (
  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
    Loading...
  </div>
);

export const PhotosetDetail = () => {
  const { photosetId } = useParams<{ photosetId: string }>();
  const id = Number(photosetId);
  const queryClient = useQueryClient();
  // DraftView copies the photoset into form and table state when it mounts. After a save, hide it
  // while the row reloads (so its buttons can't fire twice), then remount it with the saved row.
  const [draftVersion, setDraftVersion] = useState(0);
  const [reloading, setReloading] = useState(false);
  const { data, isPending, isFetching, isFetchedAfterMount, error, refetch } = useQuery({
    ...photosetQuery(id),
    enabled: !!photosetId,
    // DraftView never reads a refetched row, and a failed focus refetch would swap unsaved edits
    // for the error screen. Reads happen on mount, on Retry and after a save.
    refetchOnWindowFocus: false,
  });

  const handleDraftUpdate = async () => {
    setReloading(true);
    try {
      // All photoset keys: Home and Storage list this photoset too.
      await queryClient.invalidateQueries({ queryKey: photosetKeys.all });
      setDraftVersion((v) => v + 1);
    } finally {
      setReloading(false);
    }
  };

  if (!photosetId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm font-medium text-destructive">
        Photoset not found
      </div>
    );
  }

  // Wait for a fresh read. DraftView seeds its state from the first photoset it gets, and a cached
  // row can predate a write made elsewhere (upload, draft save, delete). The same goes for a cached
  // error, and for Retry.
  if (isPending || !isFetchedAfterMount || reloading || (error && isFetching)) {
    return <Loading />;
  }

  // An error wins over cached data: showing the old row would hide that the read failed.
  if (error || !data) {
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
