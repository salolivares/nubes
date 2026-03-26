import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  ChevronDown,
  ImageIcon,
  ImagePlus,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import type { Album, InProgressEvent, ProcessedImage } from '@/common/types';
import { albumSchema } from '@/common/types';

import { AlbumForm } from '../../components/AlbumForm/AlbumForm';
import { CameraCombobox } from '../../components/CameraCombobox';
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
} from '../../components/ui/alert-dialog';
import { Button } from '../../components/ui/button';
import { ButtonGroup } from '../../components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Form } from '../../components/ui/form';
import { Input } from '../../components/ui/input';
import { useCameras } from '../../hooks/useCameras';
import { trpc } from '../../lib/trpc';
import type { DbImage, PhotosetWithImages } from './utils';
import { toProcessedImages } from './utils';

/** Counter for generating temporary negative IDs for newly processed images. */
let nextTempId = -1;

function processedImageToDbImage(img: ProcessedImage, sortOrder: number): DbImage {
  const tempId = nextTempId--;
  return {
    id: tempId,
    photosetId: 0, // placeholder, not used for save
    name: img.name,
    camera: img.camera ?? null,
    originalPath: img.imagePaths[0]?.imagePath ?? '',
    preview: img.preview ?? null,
    sortOrder,
    createdAt: new Date().toISOString(),
    outputs: img.imagePaths.map((p, i) => ({
      id: nextTempId - i, // unique negative IDs
      imageId: tempId,
      imagePath: p.imagePath,
      type: p.type,
      resolution: p.resolution,
      byteLength: p.byteLength,
    })),
  };
}

export function DraftView({
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [processingTotal, setProcessingTotal] = useState(0);
  const unsubscribeRef = useRef<(() => void) | null>(null);
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

  // Clean up event listeners on unmount
  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
    };
  }, []);

  const handleAddImages = async () => {
    const files = await window.imagePicker.open();
    if (files.length === 0) return;

    const paths = files.map((f) => f.path);
    setIsProcessing(true);
    setProcessedCount(0);
    setProcessingTotal(paths.length);

    // Clean up any previous listeners
    unsubscribeRef.current?.();

    const unsubProgress = window.imageProcessor.onProgressChange(
      (_: unknown, event: InProgressEvent) => {
        setProcessedCount((prev) => Math.min(prev + 1, event.total));
      },
    );

    const unsubComplete = window.imageProcessor.onComplete(
      (_: unknown, result: { processedImages: ProcessedImage[] }) => {
        const newImages = result.processedImages;
        setImages((prev) => {
          const startOrder = prev.length;
          const converted = newImages.map((img, i) =>
            processedImageToDbImage(img, startOrder + i),
          );
          return [...prev, ...converted];
        });
        setImagesDirty(true);
        setIsProcessing(false);
        toast.success(`Added ${newImages.length} image${newImages.length === 1 ? '' : 's'}`);

        // Clean up listeners
        unsubProgress();
        unsubComplete();
        unsubscribeRef.current = null;
      },
    );

    unsubscribeRef.current = () => {
      unsubProgress();
      unsubComplete();
    };

    window.imageProcessor.resize(paths);
  };

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
            }
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

  const busy = isSaving || isUploading || isDeleting || isProcessing;
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
          <Button variant="outline" disabled={busy} onClick={handleAddImages}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing {processedCount}/{processingTotal}
              </>
            ) : (
              <>
                <ImagePlus className="h-4 w-4" />
                Add Images
              </>
            )}
          </Button>
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
