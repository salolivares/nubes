import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { AlertTriangle, ChevronDown, Loader2, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import type { Album, ProcessedImage, S3CreateAlbumArgs } from '@/common/types';
import { albumSchema } from '@/common/types';

import { AlbumForm } from '../../components/AlbumForm/AlbumForm';
import { CameraCombobox } from '../../components/CameraCombobox';
import { ImagePreviewDialog, pickPreviewPath } from '../../components/ImagePreviewDialog';
import { SortableTable } from '../../components/SortableTable';
import { Button } from '../../components/ui/button';
import { ButtonGroup } from '../../components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { wizardPath, WizardRedirect, WizardStep } from '../../components/wizard-step';
import { useCameras } from '../../hooks/useCameras';
import { useProcessedImages } from '../../hooks/useProcessedImages';
import { photosetKeys } from '../../lib/photoset-queries';
import { useImageStore } from '../../stores/images';
import type { PhotosetWithImages } from '../PhotosetDetail/utils';
import { toProcessedImages } from '../PhotosetDetail/utils';
import { useImageColumns } from './columns';

function toPhotosetImages(processedImages: ProcessedImage[]) {
  return processedImages.map((img, i) => ({
    name: img.name,
    camera: img.camera,
    originalPath: img.imagePaths[0]?.imagePath ?? '',
    preview: img.preview,
    sortOrder: i,
    outputs: img.imagePaths.map((p) => ({
      imagePath: p.imagePath,
      type: p.type,
      resolution: p.resolution,
      byteLength: p.byteLength,
    })),
  }));
}

export const S3Upload = () => (
  <WizardStep step="s3">{(photoset) => <S3UploadGate photoset={photoset} />}</WizardStep>
);

/**
 * Processed images live in the store during the wizard. After a reload the store is empty, so
 * load them back from the DB. With nothing in either place, send the user to the picker.
 */
const S3UploadGate = ({ photoset }: { photoset: PhotosetWithImages }) => {
  const storeCount = useImageStore((s) => s.processedImages.length);
  const setProcessedImages = useImageStore((s) => s.setProcessedImages);
  const dbCount = photoset.images.length;

  useEffect(() => {
    if (storeCount === 0 && dbCount > 0) setProcessedImages(toProcessedImages(photoset.images));
  }, [storeCount, dbCount, photoset.images, setProcessedImages]);

  if (storeCount === 0 && dbCount === 0) {
    return (
      <WizardRedirect
        to={wizardPath(photoset.id, 'picker')}
        message="No processed images. Pick some images first."
      />
    );
  }
  if (storeCount === 0) return null;

  return <S3UploadStep photosetId={photoset.id} bucketName={photoset.bucketName} />;
};

/** Write an uploaded album's images, metadata and status to the local DB. */
async function saveUploadedPhotoset(photosetId: number, values: Album, images: ProcessedImage[]) {
  await window.photosets.addImages({ photosetId, images: toPhotosetImages(images) });
  await window.photosets.update({
    id: photosetId,
    name: values.name,
    location: values.location,
    year: values.year,
  });
  await window.photosets.markUploaded({ id: photosetId });
  if (values.published) {
    await window.photosets.publish({ id: photosetId });
  }
}

const S3UploadStep = ({ photosetId, bucketName }: { photosetId: number; bucketName: string }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { processedImages, setProcessedImage, setProcessedImages } = useProcessedImages();
  // Set when S3 has the album but the local DB update failed. Holds what to retry with.
  const [dbSyncFailure, setDbSyncFailure] = useState<{ values: Album; message: string } | null>(
    null,
  );
  const { cameras, addCamera, touchCamera } = useCameras();
  const [isSaving, setIsSaving] = useState(false);
  const [imagesDirty, setImagesDirty] = useState(false);
  const [previewImage, setPreviewImage] = useState<ProcessedImage | null>(null);

  const form = useForm({
    resolver: zodResolver(albumSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      location: '',
      year: new Date().getFullYear(),
      published: false,
    },
  });

  const { mutate, isPending: isUploading } = useMutation({
    mutationFn: (args: S3CreateAlbumArgs) => window.s3.createAlbum(args),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to upload album');
    },
  });

  const { isDirty, isValid } = form.formState;
  const busy = isUploading || isSaving;
  // After a DB sync failure the album is already in S3. Only allow retrying the DB update.
  const canSubmit = (isDirty || imagesDirty) && isValid && !busy && !dbSyncFailure;

  const handleCameraSelect = (imageId: string, cameraName: string) => {
    setProcessedImage(imageId, { camera: cameraName });
    touchCamera(cameraName);
    setImagesDirty(true);
  };

  const handleCameraAdd = async (name: string) => {
    await addCamera(name);
  };

  const handleNameChange = (imageId: string, name: string) => {
    setProcessedImage(imageId, { name });
    setImagesDirty(true);
  };

  const columns = useImageColumns({
    cameras,
    onCameraSelect: handleCameraSelect,
    onCameraAdd: handleCameraAdd,
    onNameChange: handleNameChange,
    onPreview: setPreviewImage,
  });

  const table = useReactTable({
    data: processedImages,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const dataIds = useMemo(() => processedImages.map((img) => img.id), [processedImages]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = dataIds.indexOf(active.id as string);
      const newIndex = dataIds.indexOf(over.id as string);
      const reordered = arrayMove(processedImages, oldIndex, newIndex);
      setProcessedImages(reordered);
      setImagesDirty(true);
    }
  };

  // ── Submit handlers ──────────────────────────────────────────────

  /** Record a finished S3 upload in the DB. Returns false and shows the failure if it can't. */
  const syncUploadToDb = async (values: Album) => {
    try {
      await saveUploadedPhotoset(photosetId, values, processedImages);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setDbSyncFailure({ values, message });
      toast.error('Album uploaded to S3, but the local database was not updated', {
        description: message,
      });
      return false;
    }
    setDbSyncFailure(null);
    // Refetch before leaving, so the summary step doesn't read the pre-upload row from the cache.
    await queryClient.invalidateQueries({ queryKey: photosetKeys.all });
    toast.success('Album uploaded to S3');
    navigate(wizardPath(photosetId, 'summary'));
    return true;
  };

  const handleRetryDbSync = async () => {
    if (!dbSyncFailure) return;
    setIsSaving(true);
    try {
      await syncUploadToDb(dbSyncFailure.values);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpload = form.handleSubmit((values) => {
    mutate(
      { bucketName, album: values, images: processedImages },
      { onSuccess: () => syncUploadToDb(values) },
    );
  });

  const handleDraft = form.handleSubmit(async (values) => {
    setIsSaving(true);
    try {
      await window.photosets.addImages({
        photosetId,
        images: toPhotosetImages(processedImages),
      });
      await window.photosets.update({
        id: photosetId,
        name: values.name,
        location: values.location,
        year: values.year,
      });
      if (values.published) {
        await window.photosets.publish({ id: photosetId });
      }
      await queryClient.invalidateQueries({ queryKey: photosetKeys.all });
      toast.success('Draft saved');
      navigate(`/photoset/${photosetId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setIsSaving(false);
    }
  });

  return (
    <div className="p-6 md:p-10">
      {/* Header with split button */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Review & Upload</h1>
        <ButtonGroup>
          <Button disabled={!canSubmit} onClick={handleDraft}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save as Draft
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button disabled={!canSubmit} className="pl-2!" />}>
              <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleUpload}>
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload />}
                Upload to S3
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      </div>

      {dbSyncFailure && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium">
              The album is in S3, but the local database was not updated.
            </p>
            <p className="text-sm text-muted-foreground">{dbSyncFailure.message}</p>
          </div>
          <Button size="sm" variant="outline" disabled={isSaving} onClick={handleRetryDbSync}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Retry database update
          </Button>
        </div>
      )}

      {/* Mass-apply camera toolbar */}
      {processedImages.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Apply to all:</span>
          <div className="w-56">
            <CameraCombobox
              value=""
              cameras={cameras}
              onSelect={(name) => {
                for (const img of processedImages) {
                  setProcessedImage(img.id, { camera: name });
                }
                touchCamera(name);
                setImagesDirty(true);
              }}
              onAdd={handleCameraAdd}
            />
          </div>
        </div>
      )}

      {/* Image table with drag-and-drop reordering */}
      <SortableTable table={table} dataIds={dataIds} onDragEnd={handleDragEnd} />

      {/* Image preview dialog */}
      <ImagePreviewDialog
        image={previewImage}
        previewPath={previewImage ? pickPreviewPath(previewImage.imagePaths) : undefined}
        onClose={() => setPreviewImage(null)}
      />

      {/* Album form fields */}
      <div className="mt-6">
        <AlbumForm form={form} />
      </div>
    </div>
  );
};
