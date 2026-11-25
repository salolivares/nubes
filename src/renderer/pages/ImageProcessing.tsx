import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import type { ProcessedImage } from '@/common/types';

import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { WizardRedirect, WizardStep } from '../components/wizard-step';
import { useProcessingImages } from '../hooks/useProcessingImages';
import { paths } from '../lib/paths';
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
    const { files, processed, jobId } = useImageStore.getState();
    return processed || jobId !== null || files.some((file) => file.path !== undefined);
  });

  if (!hasWork) {
    return photoset.images.length > 0 ? (
      <WizardRedirect to={paths.wizard.s3(photoset.id)} />
    ) : (
      <WizardRedirect
        to={paths.wizard.picker(photoset.id)}
        message="No images to process. Pick some images first."
      />
    );
  }

  return <ImageProcessingRun photosetId={photoset.id} />;
};

const ImageProcessingRun = ({ photosetId }: { photosetId: number }) => {
  const { processingImages, processed, job, erroredImages, cancel, retry } =
    useProcessingImages(photosetId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const processedImages = useImageStore((s) => s.processedImages);

  const persistRan = useRef(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  // Only move on once the results are in the DB, so a reload on the next step can find them.
  const [persist, setPersist] = useState<'pending' | 'saved' | 'failed'>('pending');
  // The worker finished but every image failed. Nothing to upload.
  const nothingProcessed = processed && processedImages.length === 0;
  // Some images failed. Don't auto-advance past the errors.
  const hasErrors = erroredImages.length > 0;
  const inFlight = job?.status === 'queued' || job?.status === 'running';

  const goToNext = useCallback(() => {
    navigate(paths.wizard.s3(photosetId));
  }, [navigate, photosetId]);

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
        setPersist('saved');
        toast.success('Images processed successfully');
      } catch (err) {
        setPersist('failed');
        toast.error('Failed to save images', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    };

    persist();
  }, [processed, photosetId, processedImages, queryClient]);

  // Auto-navigate countdown once processing is done and saved, unless there are errors to read
  useEffect(() => {
    if (persist !== 'saved' || hasErrors) return;
    setCountdown(AUTO_NAVIGATE_SECONDS);

    const interval = setInterval(() => {
      setCountdown((prev) => (prev === null ? null : prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [persist, hasErrors]);

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
            <div key={item.file.path ?? item.name} className="flex items-center gap-4">
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
                  {item.error ? (
                    <span className="text-sm text-destructive">Failed</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">{item.progress}%</span>
                  )}
                </div>
                <Progress value={item.progress} />
              </div>
            </div>
          ))}
        </div>
        {inFlight && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={cancel}>
              Cancel
            </Button>
          </div>
        )}
        {hasErrors && (
          <div className="rounded-md border border-destructive/50 p-4 text-sm">
            <p className="font-medium text-destructive">
              {erroredImages.length} image{erroredImages.length === 1 ? '' : 's'} could not be
              processed
            </p>
            <ul className="mt-2 grid gap-1 text-muted-foreground">
              {erroredImages.map((e) => (
                <li key={e.path} className="break-all">
                  <span className="font-mono">{e.path}</span>: {e.error}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(job?.status === 'failed' || job?.status === 'cancelled') && (
          <div className="flex items-center justify-between gap-4 rounded-md border p-4">
            <p
              className={
                job.status === 'failed'
                  ? 'text-sm text-destructive'
                  : 'text-sm text-muted-foreground'
              }
            >
              {job.status === 'failed' ? job.error : 'Processing cancelled.'}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(paths.wizard.picker(photosetId))}
              >
                Pick images again
              </Button>
              <Button size="sm" onClick={retry}>
                Try again
              </Button>
            </div>
          </div>
        )}
        {persist === 'saved' && hasErrors && (
          <div className="flex justify-end">
            <Button size="sm" onClick={goToNext}>
              Continue with {processedImages.length} image
              {processedImages.length === 1 ? '' : 's'}
            </Button>
          </div>
        )}
        {persist === 'saved' && countdown !== null && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Continuing in {countdown}s…</p>
            <Button variant="outline" size="sm" onClick={goToNext}>
              Skip
            </Button>
          </div>
        )}
        {persist === 'failed' && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-destructive">
              The images were processed but not saved. You can still continue, but a reload on the
              next step will lose them.
            </p>
            <Button variant="outline" size="sm" onClick={goToNext}>
              Continue
            </Button>
          </div>
        )}
        {nothingProcessed && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-destructive">None of the images could be processed.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(paths.wizard.picker(photosetId))}
            >
              Pick images again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
