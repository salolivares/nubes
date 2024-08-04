import { useImageStore } from '../stores/images';

export const useProcessedImages = () => {
  const processedImages = useImageStore((state) => state.processedImages);
  return { processedImages };
};
