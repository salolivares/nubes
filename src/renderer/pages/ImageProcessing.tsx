import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import type { ProcessedImage } from '@/common/types';

import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { wizardPath, WizardRedirect, WizardStep } from '../components/wizard-step';
import { useProcessingImages } from '../hooks/useProcessingImages';
import { photosetKeys } from '../lib/photoset-queries';
import { useImageStore } from '../stores/images';
import type { PhotosetWithImages } from './PhotosetDetail/utils';

const AUTO_NAVIGATE_SECONDS = 3;

export const ImageProcessing = () => (
  <WizardStep step="upload">{(photoset) => <ImageProcessingGate photoset={photoset} />}</WizardStep>
);

/**
 * Picked files only live in memory, so a reload leaves nothing to process. Send the user on to the
 * S3 step if this photoset already has processed images in the DB, or back to the picker if not.
 * Never start the worker with an empty list: it would report "complete" and auto-advance.
 */
const ImageProcessingGate = ({ photoset }: { photoset: PhotosetWithImages }) => {
  // Read once on mount. Later changes come from this step's own processing run.
  const [hasWork] = useState(() => {
    const { files, processed } = useImageStore.getState();
    return processed || files.some((file) => file.path !== undefined);
  });

  if (!hasWork) {
    return photoset.images.length > 0 ? (
      <WizardRedirect to={wizardPath(photoset.id, 's3')} />
    ) : (
      <WizardRedirect
        to={wizardPath(photoset.id, 'picker')}
        message="No images to process. Pick some images first."
      />
    );
  }

  return <ImageProcessingRun photosetId={photoset.id} />;
};

const ImageProcessingRun = ({ photosetId }: { photosetId: number }) => {
  const { files, processingImages, processed } = useProcessingImages();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const processedImages = useImageStore((s) => s.processedImages);

  const uploadRan = useRef(false);
  const persistRan = useRef(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const goToNext = useCallback(() => {
    navigate(wizardPath(photosetId, 's3'));
  }, [navigate, photosetId]);

  useEffect(() => {
    if (!uploadRan.current && !useImageStore.getState().processed) {
      window.imageProcessor.resize({
        imagePaths: files
          .filter((file) => file.path !== undefined)
          .map((file) => file.path as string),
      });
    }

    return () => {
      uploadRan.current = true;
    };
  }, []);

  // Persist processed images to the photoset in the DB
  useEffect(() => {
    if (!processed || persistRan.current || processedImages.length === 0) return;
    persistRan.current = true;

    const persist = async () => {
      try {
        await window.photosets.addImages({
          photosetId,
          images: processedImages.map((img: ProcessedImage, i: number) => ({
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
          })),
        });
        await queryClient.invalidateQueries({ queryKey: photosetKeys.all });
        toast.success('Images processed successfully');
      } catch (err) {
        toast.error('Failed to save images', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    };

    persist();
  }, [processed, photosetId, processedImages, queryClient]);

  // Auto-navigate countdown once processing is done
  useEffect(() => {
    if (!processed) return;
    setCountdown(AUTO_NAVIGATE_SECONDS);

    const interval = setInterval(() => {
      setCountdown((prev) => (prev === null ? null : prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [processed]);

  useEffect(() => {
    if (countdown === 0) goToNext();
  }, [countdown, goToNext]);

  return (
    <div className="container mx-auto px-4 md:px-6 py-12">
      <div className="max-w-2xl mx-auto grid gap-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Image Processing</h1>
        </div>
        <div className="grid gap-6">
          {processingImages.map((item) => (
            <div key={item.name} className="flex items-center gap-4">
              <img
                src={item.file.preview}
                alt={`Image ${item.name}`}
                width={80}
                height={80}
                className="rounded-md object-cover"
                style={{ aspectRatio: '80/80', objectFit: 'cover' }}
              />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-sm text-muted-foreground">{item.progress}%</span>
                </div>
                <Progress value={item.progress} />
              </div>
            </div>
          ))}
        </div>
        {processed && countdown !== null && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Continuing in {countdown}s…</p>
            <Button variant="outline" size="sm" onClick={goToNext}>
              Skip
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
