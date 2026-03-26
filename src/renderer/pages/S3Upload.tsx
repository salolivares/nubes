import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, Loader2, Upload } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import type { Album, ProcessedImage } from '@/common/types';
import { albumSchema } from '@/common/types';

import { AlbumForm } from '../components/AlbumForm/AlbumForm';
import { CameraCombobox } from '../components/CameraCombobox';
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
import { useProcessedImages } from '../hooks/useProcessedImages';
import { trpc } from '../lib/trpc';
import { useImageStore } from '../stores/images';

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

export const S3Upload = () => {
  const { bucketName } = useParams();
  const navigate = useNavigate();
  const photosetId = useImageStore((s) => s.photosetId);
  const { processedImages, setProcessedImage } = useProcessedImages();
  const { cameras, addCamera, touchCamera } = useCameras();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<Album>({
    resolver: zodResolver(albumSchema),
    defaultValues: {
      name: '',
      location: '',
      year: new Date().getFullYear(),
      published: false,
    },
  });

  const { mutate, isLoading: isUploading } = trpc.bucket.createAlbum.useMutation({
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const { isDirty, isValid } = form.formState;
  const busy = isUploading || isSaving;
  const canSubmit = isDirty && isValid && !busy;

  const handleCameraSelect = (imageId: string, cameraName: string) => {
    setProcessedImage(imageId, { camera: cameraName });
    touchCamera(cameraName);
  };

  const handleCameraAdd = async (name: string) => {
    await addCamera(name);
  };

  const handleUpload = form.handleSubmit((values) => {
    if (!bucketName) {
      toast.error('Bucket name is required');
      return;
    }

    mutate(
      { bucketName, album: values, images: processedImages },
      {
        onSuccess: async () => {
          if (photosetId) {
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
              await window.photosets.markUploaded({ id: photosetId });
              if (values.published) {
                await window.photosets.publish({ id: photosetId });
              }
            } catch {
              // Non-fatal: S3 upload succeeded, DB update is best-effort
            }
          }
          toast.success('Album uploaded to S3');
          navigate('../summary', { relative: 'path' });
        },
      },
    );
  });

  const handleDraft = form.handleSubmit(async (values) => {
    if (!photosetId) {
      toast.error('No photoset to save');
      return;
    }

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
      toast.success('Draft saved');
      navigate(`/photoset/${photosetId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setIsSaving(false);
    }
  });

  return (
    <div>
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
          {processedImages.map((image) => (
            <tr key={image.id} className="border-b hover:bg-muted/50 transition-colors">
              <td className="px-4 py-3 text-left">
                <img
                  src={`data:image/jpeg;base64,${image.preview}`}
                  alt={image.name}
                  width={64}
                  height={64}
                  className="aspect-square object-cover rounded-md"
                />
              </td>
              <td className="px-4 py-3 text-left">
                <Input
                  type="text"
                  defaultValue={image.name}
                  onBlur={(e) => setProcessedImage(image.id, { name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setProcessedImage(image.id, { name: (e.target as HTMLInputElement).value });
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
                  onAdd={handleCameraAdd}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Album form fields */}
      <Form {...form}>
        <form className="mt-6 space-y-4">
          <AlbumForm form={form} />
        </form>
      </Form>
    </div>
  );
};
