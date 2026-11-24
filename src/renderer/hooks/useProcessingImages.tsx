import { useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';

import type { ImageError } from '@/common/types';

import { useImageJobStore } from '../stores/image-jobs';
import type { CustomFile } from '../stores/images';
import { useImageStore } from '../stores/images';

export interface ProcessingImage {
  name: string;
  progress: number;
  file: CustomFile;
  error?: string;
}

/**
 * Runs the image processing job for the upload flow and tracks it by jobId. The job's progress
 * lives in useImageJobStore, so leaving the page and coming back picks it up where it is.
 */
export const useProcessingImages = (photosetId: number) => {
  const files = useImageStore((state) => state.files);
  const jobId = useImageStore((state) => state.jobId);
  const processed = useImageStore((state) => state.processed);
  const setJobId = useImageStore((state) => state.setJobId);
  const setProcessedImages = useImageStore((state) => state.setProcessedImages);
  const setProcessed = useImageStore((state) => state.setProcessed);
  const loadPreviews = useImageStore((state) => state.loadPreviews);
  const unloadPreviews = useImageStore((state) => state.unloadPreviews);
  const job = useImageJobStore((state) => (jobId ? state.jobs[jobId] : undefined));
  // Survives StrictMode's double effect run, so dev doesn't start two jobs.
  const starting = useRef(false);

  useEffect(() => {
    loadPreviews();
    return () => unloadPreviews();
  }, []);

  const startJob = useCallback(async () => {
    const { files, selectionVersion } = useImageStore.getState();
    const imagePaths = files.flatMap((file) => (file.path === undefined ? [] : [file.path]));
    // An empty job would "complete" at once and look like success. The wizard gates on this too.
    if (starting.current || imagePaths.length === 0) return;
    starting.current = true;
    setProcessed(false);
    setProcessedImages([]);
    try {
      const started = await useImageJobStore.getState().start(photosetId, imagePaths);
      // The user may have changed the selection or started over while main was replying.
      if (useImageStore.getState().selectionVersion === selectionVersion) {
        setJobId(started.jobId);
      } else {
        void useImageJobStore.getState().cancel(started.jobId);
      }
    } catch (err) {
      toast.error('Could not start image processing', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      starting.current = false;
    }
  }, [photosetId, setJobId, setProcessed, setProcessedImages]);

  // Start a job on first visit. On a remount, catch up on the job already running. If results
  // are already in, there is nothing to start.
  useEffect(() => {
    const { jobId: existing, processed: alreadyProcessed } = useImageStore.getState();
    if (existing) {
      void useImageJobStore.getState().refresh(existing);
    } else if (!alreadyProcessed) {
      void startJob();
    }
  }, []);

  useEffect(() => {
    if (job?.status === 'complete' && !processed) {
      setProcessedImages(job.processedImages);
      setProcessed(true);
    }
  }, [job?.status, job?.processedImages, processed, setProcessedImages, setProcessed]);

  const cancel = useCallback(() => {
    if (jobId) void useImageJobStore.getState().cancel(jobId);
  }, [jobId]);

  const processingImages = useMemo<ProcessingImage[]>(() => {
    const errors = new Map((job?.erroredImages ?? []).map((e) => [e.path, e.error]));
    const done = new Set(job?.donePaths ?? []);
    return files.map((file) => ({
      name: file.name,
      file,
      progress: file.path !== undefined && done.has(file.path) ? 100 : 0,
      error: file.path === undefined ? undefined : errors.get(file.path),
    }));
  }, [files, job?.donePaths, job?.erroredImages]);

  return {
    files,
    processingImages,
    processed,
    job,
    erroredImages: job?.erroredImages ?? ([] as ImageError[]),
    cancel,
    retry: startJob,
  };
};
