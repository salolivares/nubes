import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ArrowLeft, ChevronDown, ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import type { ProcessedImage, S3CreateAlbumArgs } from '@/common/types';
import { albumSchema } from '@/common/types';

import { AlbumForm } from '../../../components/AlbumForm/AlbumForm';
import { CameraCombobox } from '../../../components/CameraCombobox';
import { ImagePreviewDialog, pickPreviewPath } from '../../../components/ImagePreviewDialog';
import { UnnamedPhotosNotice } from '../../../components/PhotoNameInput';
import { SortableTable } from '../../../components/SortableTable';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { Button } from '../../../components/ui/button';
import { ButtonGroup } from '../../../components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { useCameras } from '../../../hooks/useCameras';
import { usePhotoNameCheck } from '../../../hooks/usePhotoNameCheck';
import { paths } from '../../../lib/paths';
import { forgetPhotosets } from '../../../lib/photoset-queries';
import { uploadAlbum } from '../../../lib/upload-album';
import { useImageJobStore } from '../../../stores/image-jobs';
import type { DbImage, PhotosetWithImages } from '../utils';
import { toProcessedImages } from '../utils';
import { useImageColumns } from './columns';

// ── Helpers ──────────────────────────────────────────────────────────

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

// ── Component ────────────────────────────────────────────────────────

export function DraftView({
  photoset,
  onUpdate,
}: {
  photoset: PhotosetWithImages;
  onUpdate: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { cameras, addCamera, touchCamera } = useCameras();
  const [images, setImages] = useState(photoset.images);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const job = useImageJobStore((s) => (jobId ? s.jobs[jobId] : undefined));
  const isProcessing = isStarting || job?.status === 'queued' || job?.status === 'running';
  const processedCount = job?.donePaths.length ?? 0;
  const processingTotal = job?.imagePaths.length ?? 0;

  // The results only land in this view's local state, so leaving the draft drops them. Cancel the
  // job instead of letting it finish into nothing (and toast "Added" on a page that's gone).
  useEffect(() => {
    if (!jobId) return;
    return () => void useImageJobStore.getState().cancel(jobId);
  }, [jobId]);
  const form = useForm({
    resolver: zodResolver(albumSchema),
    mode: 'onChange',
    defaultValues: {
      name: photoset.name,
      location: photoset.location,
      description: photoset.description,
      year: photoset.year,
      month: photoset.month ?? undefined,
      published: photoset.status === 'published',
    },
  });

  const { mutate: uploadMutate, isPending: isUploading } = useMutation({
    mutationFn: (args: S3CreateAlbumArgs) => uploadAlbum(args),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to upload album');
    },
  });

  const hasOutputs = images.some((img) => img.outputs.length > 0);

  const [imagesDirty, setImagesDirty] = useState(false);
  const [previewImage, setPreviewImage] = useState<DbImage | null>(null);
  const [pendingFileDeletes, setPendingFileDeletes] = useState<string[]>([]);

  const handleAddImages = async () => {
    const files = await window.imagePicker.open();
    if (files.length === 0) return;

    setIsStarting(true);
    const finished = await useImageJobStore
      .getState()
      .run(
        photoset.id,
        files.map((f) => f.path),
        (id) => {
          setJobId(id);
          setIsStarting(false);
        },
      )
      .catch((err: unknown) => {
        setIsStarting(false);
        toast.error('Could not start image processing', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
        return null;
      });

    if (!finished) return;
    if (finished.status === 'failed') {
      toast.error('Image processing failed', { description: finished.error ?? undefined });
      return;
    }
    if (finished.status !== 'complete') return;

    const newImages = finished.processedImages;
    if (newImages.length > 0) {
      setImages((prev) => [
        ...prev,
        ...newImages.map((img, i) => processedImageToDbImage(img, prev.length + i)),
      ]);
      setImagesDirty(true);
      toast.success(`Added ${newImages.length} image${newImages.length === 1 ? '' : 's'}`);
    }
    for (const { path, error } of finished.erroredImages) {
      toast.error(`Could not process ${path}`, { description: error });
    }
  };

  const handleImageUpdate = (
    imageId: number,
    updates: Partial<Pick<DbImage, 'name' | 'camera'>>,
  ) => {
    setImages((prev) => prev.map((img) => (img.id === imageId ? { ...img, ...updates } : img)));
    setImagesDirty(true);
  };

  const photoNames = useMemo(
    () =>
      images.map((img) => ({
        id: String(img.id),
        name: img.name,
        outputPaths: img.outputs.map((o) => o.imagePath),
      })),
    [images],
  );
  const nameCheck = usePhotoNameCheck(photoNames);

  const handleCameraSelect = (imageId: number, cameraName: string) => {
    handleImageUpdate(imageId, { camera: cameraName });
    touchCamera(cameraName);
  };

  const busy = isSaving || isUploading || isDeleting || isProcessing;

  const handleRemoveImage = (image: DbImage) => {
    setImages((prev) => prev.filter((img) => img.id !== image.id));
    setImagesDirty(true);

    // Queue output files for deletion on next save
    const filePaths = image.outputs.map((o) => o.imagePath);
    if (filePaths.length > 0) {
      setPendingFileDeletes((prev) => [...prev, ...filePaths]);
    }
  };

  const columns = useImageColumns({
    cameras,
    onCameraSelect: handleCameraSelect,
    onCameraAdd: async (name) => addCamera(name),
    onNameChange: (imageId, name) => {
      handleImageUpdate(imageId, { name });
      nameCheck.markTouched(String(imageId));
    },
    nameErrors: nameCheck.visibleErrors,
    onPreview: setPreviewImage,
    onRemove: handleRemoveImage,
    disabled: busy,
  });

  const table = useReactTable({
    data: images,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  });

  const dataIds = useMemo(() => images.map((img) => String(img.id)), [images]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = dataIds.indexOf(String(active.id));
      const newIndex = dataIds.indexOf(String(over.id));
      setImages((prev) => arrayMove(prev, oldIndex, newIndex));
      setImagesDirty(true);
    }
  };

  const flushPendingDeletes = async () => {
    if (pendingFileDeletes.length === 0) return;
    try {
      await window.photosets.removeFiles({ filePaths: pendingFileDeletes });
    } catch {
      // Non-fatal: files may already be gone
    }
    setPendingFileDeletes([]);
  };

  // ── Submit handlers ──────────────────────────────────────────────

  const handleSave = form.handleSubmit(async (values) => {
    setIsSaving(true);
    try {
      await window.photosets.update({
        id: photoset.id,
        name: values.name,
        location: values.location,
        description: values.description,
        year: values.year,
        month: values.month ?? null,
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
      await flushPendingDeletes();
      toast.success('Draft saved');
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  });

  // Saving the draft can keep file names. Only the upload needs every photo named.
  const handleUpload = form.handleSubmit((values) => {
    if (!nameCheck.checkBeforeUpload()) return;
    const processedImages = toProcessedImages(images);

    uploadMutate(
      { bucketName: photoset.bucketName, album: values, images: processedImages },
      {
        onSuccess: async () => {
          // Keep the buttons disabled: isUploading is already false when this runs.
          setIsSaving(true);
          try {
            await window.photosets.update({
              id: photoset.id,
              name: values.name,
              location: values.location,
              description: values.description,
              year: values.year,
              month: values.month ?? null,
              // Unchecking Published must reach the DB too, or a later export disagrees with S3.
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
            }
            if (values.published) {
              await window.photosets.publish({ id: photoset.id });
            }
            // Last, so `uploadedAt` is only set once everything before it is saved.
            await window.photosets.markUploaded({ id: photoset.id });
          } catch (err) {
            toast.error('Album uploaded to S3, but the local database was not updated', {
              description: err instanceof Error ? err.message : 'Unknown error',
            });
            setIsSaving(false);
            onUpdate();
            return;
          }
          await flushPendingDeletes();
          setIsSaving(false);
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
      void forgetPhotosets(queryClient, [photoset.id]);
      navigate(paths.home());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
      setIsDeleting(false);
    }
  };

  const { isDirty, isValid } = form.formState;
  const canSubmit = (isDirty || imagesDirty) && isValid && !busy;
  const canUpload = isValid && !busy && hasOutputs;

  return (
    <div className="space-y-6 p-6 md:p-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(paths.home())}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{photoset.name}</h1>
            <p className="text-sm text-muted-foreground">Draft &middot; {photoset.bucketName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <UnnamedPhotosNotice
            count={hasOutputs ? nameCheck.unnamedCount : 0}
            emphasize={nameCheck.attempted}
          />
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
          <ButtonGroup>
            <Button disabled={!canSubmit} onClick={handleSave}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Draft
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button disabled={busy} aria-label="More actions" className="px-2!" />}
              >
                <ChevronDown />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuItem disabled={!canUpload} onClick={handleUpload}>
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload />}
                    Upload to S3
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={busy}
                    onClick={() => {
                      setTimeout(() => setShowDeleteDialog(true), 0);
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 />
                    Delete Photoset
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
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
        </div>
      </div>

      {!hasOutputs && images.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          No processed image outputs found. You can still edit metadata and save, but uploading to
          S3 is disabled. Re-process the images to enable upload.
        </div>
      )}

      {isUploading && (
        <div className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Uploading to S3&hellip;
        </div>
      )}

      {/* Mass-apply camera toolbar */}
      {images.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Apply to all:</span>
          <div className="w-56">
            <CameraCombobox
              value=""
              cameras={cameras}
              onSelect={(name) => {
                setImages((prev) => prev.map((img) => ({ ...img, camera: name })));
                touchCamera(name);
                setImagesDirty(true);
              }}
              onAdd={async (name) => addCamera(name)}
            />
          </div>
        </div>
      )}

      {/* Image table with drag-and-drop reordering */}
      <SortableTable table={table} dataIds={dataIds} onDragEnd={handleDragEnd} />

      {/* Image preview dialog */}
      <ImagePreviewDialog
        image={previewImage}
        previewPath={previewImage ? pickPreviewPath(previewImage.outputs) : undefined}
        onClose={() => setPreviewImage(null)}
      />

      {/* Album form fields */}
      <AlbumForm form={form} />
    </div>
  );
}
