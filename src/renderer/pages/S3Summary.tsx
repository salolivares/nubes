import { Calendar, Camera, CheckCircle2, MapPin } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import type { Album } from '@/common/types';

import { Button } from '../components/ui/button';
import { useProcessedImages } from '../hooks/useProcessedImages';
import { useImageStore } from '../stores/images';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const S3Summary = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { processedImages } = useProcessedImages();
  const reset = useImageStore((s) => s.reset);

  const album = (location.state as { album?: Album } | null)?.album;

  const totalSize = processedImages.reduce(
    (sum, img) => sum + img.imagePaths.reduce((s, p) => s + p.byteLength, 0),
    0,
  );

  const totalFiles = processedImages.reduce((sum, img) => sum + img.imagePaths.length, 0);

  const handleStartOver = () => {
    reset();
    navigate('/');
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-8 w-8 text-green-500" />
        <h1 className="text-2xl font-bold">Album Uploaded</h1>
      </div>

      {album && (
        <div className="rounded-lg border bg-muted/50 p-6 space-y-2">
          <h2 className="text-lg font-semibold">{album.name}</h2>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {album.location}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {album.year}
            </span>
            <span className="flex items-center gap-1">
              <Camera className="h-4 w-4" />
              {processedImages.length} {processedImages.length === 1 ? 'image' : 'images'}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {totalFiles} files totalling {formatBytes(totalSize)}
            {album.published ? ' · Published' : ' · Draft'}
          </p>
        </div>
      )}

      {processedImages.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Uploaded Images</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {processedImages.map((image) => (
              <div key={image.id} className="space-y-1">
                <img
                  src={`data:image/jpeg;base64,${image.preview}`}
                  alt={image.name}
                  className="aspect-square w-full rounded-md object-cover"
                />
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
