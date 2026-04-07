import { useImageStore } from '../stores/images';

export const useProcessedImages = () => {
  const processedImages = useImageStore((state) => state.processedImages);
  const setProcessedImage = useImageStore((state) => state.setProcessedImage);
  const setProcessedImages = useImageStore((state) => state.setProcessedImages);

  return { processedImages, setProcessedImage, setProcessedImages };
};
