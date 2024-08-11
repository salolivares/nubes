import { useImageStore } from '../stores/images';

export const useProcessedImages = () => {
  const processedImages = useImageStore((state) => state.processedImages);
  const setProcessedImage = useImageStore((state) => state.setProcessedImage);

  return { processedImages, setProcessedImage };
};
