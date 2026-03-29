import { Calendar, Camera, CheckCircle2, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../components/ui/button';
import { useImageStore } from '../stores/images';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type PhotosetData = Awaited<ReturnType<Window['photosets']['get']>>;

export const S3Summary = () => {
  const navigate = useNavigate();
  const photosetId = useImageStore((s) => s.photosetId);
  const reset = useImageStore((s) => s.reset);
  const [photoset, setPhotoset] = useState<PhotosetData>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!photosetId) {
      setLoading(false);
      return;
    }

    window.photosets
      .get({ id: photosetId })
      .then(setPhotoset)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [photosetId]);

  const totalSize = photoset?.images.reduce(
    (sum, img) => sum + img.outputs.reduce((s, p) => s + p.byteLength, 0),
    0,
  ) ?? 0;

  const totalFiles = photoset?.images.reduce(
    (sum, img) => sum + img.outputs.length,
    0,
  ) ?? 0;

  const handleStartOver = () => {
    reset();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 md:p-10">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-8 w-8 text-green-500" />
        <h1 className="text-2xl font-bold">Album Uploaded</h1>
      </div>

      {photoset && (
        <div className="rounded-lg border bg-muted/50 p-6 space-y-2">
          <h2 className="text-lg font-semibold">{photoset.name}</h2>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {photoset.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {photoset.location}
              </span>
            )}
            {photoset.year && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {photoset.year}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Camera className="h-4 w-4" />
              {photoset.images.length} {photoset.images.length === 1 ? 'image' : 'images'}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {totalFiles} files totalling {formatBytes(totalSize)}
            {photoset.status === 'published' ? ' · Published' : ' · Draft'}
          </p>
        </div>
      )}

      {photoset && photoset.images.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Uploaded Images</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {photoset.images.map((image) => (
              <div key={image.id} className="space-y-1">
                {image.preview && (
                  <img
                    src={`data:image/jpeg;base64,${image.preview}`}
                    alt={image.name}
                    className="aspect-square w-full rounded-md object-cover"
                  />
                )}
                <p className="truncate text-xs text-muted-foreground">{image.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button onClick={handleStartOver}>Start Over</Button>
      </div>
    </div>
  );
};
