import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Button } from '../../components/ui/button';
import { DraftView } from './DraftView';
import { UploadedView } from './UploadedView';
import type { PhotosetWithImages } from './utils';

export const PhotosetDetail = () => {
  const { photosetId } = useParams<{ photosetId: string }>();
  const [photoset, setPhotoset] = useState<PhotosetWithImages | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPhotoset = useCallback(async () => {
    if (!photosetId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await window.photosets.get({ id: Number(photosetId) });
      if (!data) {
        setError('Photoset not found');
      } else {
        setPhotoset(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load photoset');
    } finally {
      setLoading(false);
    }
  }, [photosetId]);

  useEffect(() => {
    loadPhotoset();
  }, [loadPhotoset]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (error || !photoset) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-medium text-destructive">{error ?? 'Photoset not found'}</p>
        <Button variant="outline" size="sm" onClick={loadPhotoset}>
          Retry
        </Button>
      </div>
    );
  }

  if (photoset.uploadedAt) {
    return <UploadedView photoset={photoset} />;
  }

  return <DraftView photoset={photoset} onUpdate={loadPhotoset} />;
};
