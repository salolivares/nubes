import { useEffect } from 'react';

import type { InProgressEvent, ProcessedImage } from '@/common/types';

import { useImageStore } from '../stores/images';

export const useProcessingImages = () => {
  const files = useImageStore((state) => state.files);
  const processingImages = useImageStore((state) => state.processingImages);
  const processed = useImageStore((state) => state.processed);
  const initializeProcessingImages = useImageStore((state) => state.initializeProcessingImages);
  const setProcessingImages = useImageStore((state) => state.setProcessingImages);
  const setProcessedImages = useImageStore((state) => state.setProcessedImages);
  const setProcessed = useImageStore((state) => state.setProcessed);
  const loadPreviews = useImageStore((state) => state.loadPreviews);
  const unloadPreviews = useImageStore((state) => state.unloadPreviews);

  useEffect(() => {
    loadPreviews();
    return () => unloadPreviews();
  }, []);

  useEffect(() => {
    initializeProcessingImages();
  }, [initializeProcessingImages]);

  useEffect(() => {
    const unsubscribeProgress = window.imageProcessor.onProgressChange(
      (_, inProgressEvent: InProgressEvent) => {
        setProcessingImages(
          processingImages.map((file) => {
            if (file.name === inProgressEvent.name) {
              return {
                ...file,
                progress: 100,
              };
            }

            return file;
          })
        );
      }
    );

    const unsubscribeComplete = window.imageProcessor.onComplete((_, processedImages) => {
      console.log('Processed images', processedImages);
      setProcessed(true);
      setProcessedImages(processedImages.processedImages as ProcessedImage[]);
    });

    return () => {
      unsubscribeProgress();
      unsubscribeComplete();
    };
  }, [processingImages, setProcessed, setProcessingImages]);

  return {
    files,
    processingImages,
    processed,
  };
};
