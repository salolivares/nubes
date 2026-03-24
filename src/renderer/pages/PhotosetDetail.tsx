import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  HardDrive,
  ImageIcon,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import type { Album, ProcessedImage } from '@/common/types';
import { albumSchema } from '@/common/types';

import { AlbumForm } from '../components/AlbumForm/AlbumForm';
import { CameraCombobox } from '../components/CameraCombobox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ButtonGroup } from '../components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Form } from '../components/ui/form';
import { Input } from '../components/ui/input';
import { useCameras } from '../hooks/useCameras';
import { trpc } from '../lib/trpc';

type PhotosetWithImages = NonNullable<Awaited<ReturnType<Window['photosets']['get']>>>;
type DbImage = PhotosetWithImages['images'][number];

/** Convert DB images back to ProcessedImage[] for the tRPC upload mutation. */
function toProcessedImages(images: DbImage[]): ProcessedImage[] {
  return images.map((img) => ({
    id: String(img.id),
    name: img.name,
    camera: img.camera ?? undefined,
    preview: img.preview ?? undefined,
    imagePaths: img.outputs.map((o) => ({
      imagePath: o.imagePath,
      type: o.type,
      resolution: o.resolution,
      byteLength: o.byteLength,
    })),
  }));
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Uploaded (read-only) view
// ---------------------------------------------------------------------------

function UploadedView({ photoset }: { photoset: PhotosetWithImages }) {
  const navigate = useNavigate();

  const totalFiles = photoset.images.reduce((sum, img) => sum + img.outputs.length, 0);
  const totalBytes = photoset.images.reduce(
    (sum, img) => sum + img.outputs.reduce((s, o) => s + o.byteLength, 0),
    0,
  );

  const s3Prefix = `${photoset.year}-${(photoset.location ?? '').replace(/\s+/g, '-').toLowerCase()}`;
  const s3ConsoleUrl = `https://s3.console.aws.amazon.com/s3/buckets/${photoset.bucketName}?prefix=${encodeURIComponent(s3Prefix)}/`;

  return (
    <div className="space-y-6">
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
        <div className="flex items-center gap-2">
          <Badge variant={photoset.status === 'published' ? 'default' : 'secondary'}>
            {photoset.status}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Upload className="h-3 w-3" />
            Uploaded {formatDate(photoset.uploadedAt!)}
          </Badge>
        </div>
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

// ---------------------------------------------------------------------------
// Draft (editable) view
// ---------------------------------------------------------------------------

function DraftView({
  photoset,
  onUpdate,
}: {
  photoset: PhotosetWithImages;
  onUpdate: () => void;
}) {
  const navigate = useNavigate();
  const { cameras, addCamera, touchCamera } = useCameras();
  const [images, setImages] = useState(photoset.images);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const form = useForm<Album>({
    resolver: zodResolver(albumSchema),
    defaultValues: {
      name: photoset.name,
      location: photoset.location ?? '',
      year: photoset.year ?? new Date().getFullYear(),
      published: photoset.status === 'published',
    },
  });

  const { mutate: uploadMutate, isLoading: isUploading } = trpc.bucket.createAlbum.useMutation({
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const hasOutputs = images.some((img) => img.outputs.length > 0);

  const [imagesDirty, setImagesDirty] = useState(false);

  const handleImageUpdate = (imageId: number, updates: Partial<Pick<DbImage, 'name' | 'camera'>>) => {
    setImages((prev) => prev.map((img) => (img.id === imageId ? { ...img, ...updates } : img)));
    setImagesDirty(true);
  };

  const handleCameraSelect = (imageId: number, cameraName: string) => {
    handleImageUpdate(imageId, { camera: cameraName });
    touchCamera(cameraName);
  };

  const handleSave = form.handleSubmit(async (values) => {
    setIsSaving(true);
    try {
      await window.photosets.update({
        id: photoset.id,
        name: values.name,
        location: values.location,
        year: values.year,
        status: values.published ? 'published' : 'draft',
      });
      if (imagesDirty) {
        await window.photosets.addImages({
          photosetId: photoset.id,
          images: images.map((img, i) => ({
            name: img.name,
            camera: img.camera ?? undefined,
            originalPath: img.originalPath,
            preview: img.preview ?? undefined,
            sortOrder: i,
            outputs: img.outputs.map((o) => ({
              imagePath: o.imagePath,
              type: o.type,
              resolution: o.resolution,
              byteLength: o.byteLength,
            })),
          })),
        });
        setImagesDirty(false);
      }
      toast.success('Draft saved');
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  });

  const handleUpload = form.handleSubmit((values) => {
    const processedImages = toProcessedImages(images);

    uploadMutate(
      { bucketName: photoset.bucketName, album: values, images: processedImages },
      {
        onSuccess: async () => {
          try {
            await window.photosets.update({
              id: photoset.id,
              name: values.name,
              location: values.location,
              year: values.year,
            });
            await window.photosets.markUploaded({ id: photoset.id });
            if (values.published) {
              await window.photosets.publish({ id: photoset.id });
            }
          } catch {
            // Non-fatal
          }
          toast.success('Album uploaded to S3');
          onUpdate();
        },
      },
    );
  });

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await window.photosets.delete({ id: photoset.id });
      toast.success('Photoset deleted');
      navigate('/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
      setIsDeleting(false);
    }
  };

  const busy = isSaving || isUploading || isDeleting;
  const { isDirty, isValid } = form.formState;
  const canSubmit = (isDirty || imagesDirty) && isValid && !busy;
  const canUpload = isValid && !busy && hasOutputs;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{photoset.name}</h1>
            <p className="text-sm text-muted-foreground">Draft &middot; {photoset.bucketName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" disabled={busy}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete photoset?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete &ldquo;{photoset.name}&rdquo; and all its images from
                  the local database. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <ButtonGroup>
            <Button disabled={!canSubmit} onClick={handleSave}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Draft
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={busy} className="pl-2!">
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={!canUpload}
                  onClick={handleUpload}
                >
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload />}
                  Upload to S3
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
        </div>
      </div>

      {!hasOutputs && images.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          No processed image outputs found. You can still edit metadata and save,
          but uploading to S3 is disabled. Re-process the images to enable upload.
        </div>
      )}

      {/* Image table */}
      <table className="w-full">
        <thead>
          <tr className="bg-muted">
            <th className="px-4 py-2 text-left">Image</th>
            <th className="px-4 py-2 text-left">Name</th>
            <th className="px-4 py-2 text-left">Camera</th>
          </tr>
        </thead>
        <tbody>
          {images.map((image) => (
            <tr key={image.id} className="border-b hover:bg-muted/50 transition-colors">
              <td className="px-4 py-3 text-left">
                {image.preview ? (
                  <img
                    src={`data:image/jpeg;base64,${image.preview}`}
                    alt={image.name}
                    width={64}
                    height={64}
                    className="aspect-square object-cover rounded-md"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-md bg-muted">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-left">
                <Input
                  type="text"
                  defaultValue={image.name}
                  onBlur={(e) => handleImageUpdate(image.id, { name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleImageUpdate(image.id, { name: (e.target as HTMLInputElement).value });
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="border-transparent bg-transparent shadow-none hover:border-input focus:border-input focus:bg-background"
                />
              </td>
              <td className="px-4 py-3 text-left">
                <CameraCombobox
                  value={image.camera ?? ''}
                  cameras={cameras}
                  onSelect={(name) => handleCameraSelect(image.id, name)}
                  onAdd={async (name) => addCamera(name)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Album form fields */}
      <Form {...form}>
        <form className="space-y-4">
          <AlbumForm form={form} />
        </form>
      </Form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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
