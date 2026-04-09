import { ArrowLeft, Download, ExternalLink, HardDrive, ImageIcon, Upload } from 'lucide-react';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import type { PhotosetWithImages } from './utils';
import { formatBytes, formatDate } from './utils';

export function UploadedView({ photoset }: { photoset: PhotosetWithImages }) {
  const navigate = useNavigate();

  const handleExportJson = useCallback(async () => {
    try {
      const { filePath } = await window.photosets.exportMetadata({ id: photoset.id });
      toast.success('Metadata exported', {
        description: filePath,
        action: {
          label: 'Reveal file',
          onClick: () => window.photosets.showInFolder({ filePath }),
        },
      });
    } catch (err) {
      toast.error('Failed to export metadata', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [photoset.id]);

  const totalFiles = photoset.images.reduce((sum, img) => sum + img.outputs.length, 0);
  const totalBytes = photoset.images.reduce(
    (sum, img) => sum + img.outputs.reduce((s, o) => s + o.byteLength, 0),
    0,
  );

  const s3Prefix = `${photoset.year}-${photoset.location.replace(/\s+/g, '-').toLowerCase()}`;
  const s3ConsoleUrl = `https://s3.console.aws.amazon.com/s3/buckets/${photoset.bucketName}?prefix=${encodeURIComponent(s3Prefix)}/`;

  return (
    <div className="space-y-6 p-6 md:p-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{photoset.name}</h1>
            <p className="text-sm text-muted-foreground">
              {photoset.location} &middot; {photoset.year} &middot; {photoset.bucketName}
            </p>
          </div>
        </div>
        <Badge className="gap-1 border-transparent bg-green-600 text-white">
          <Upload className="h-3 w-3" />
          Uploaded {formatDate(photoset.uploadedAt!)}
        </Badge>
      </div>

      {/* Stats */}
      <div className="flex gap-6 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <ImageIcon className="h-4 w-4" />
          {photoset.images.length} {photoset.images.length === 1 ? 'image' : 'images'}
        </span>
        <span className="flex items-center gap-1">
          <HardDrive className="h-4 w-4" />
          {totalFiles} files &middot; {formatBytes(totalBytes)}
        </span>
        <a
          href={s3ConsoleUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          View in S3 Console
        </a>
        <button
          type="button"
          onClick={handleExportJson}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <Download className="h-4 w-4" />
          Export JSON
        </button>
      </div>

      {/* Image grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {photoset.images.map((image) => (
          <div key={image.id} className="space-y-1.5">
            {image.preview ? (
              <img
                src={`data:image/jpeg;base64,${image.preview}`}
                alt={image.name}
                className="aspect-square w-full rounded-md object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-md bg-muted">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <p className="truncate text-sm font-medium">{image.name}</p>
            {image.camera && (
              <p className="truncate text-xs text-muted-foreground">{image.camera}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
