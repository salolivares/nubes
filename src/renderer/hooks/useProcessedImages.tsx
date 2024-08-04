import { useImageStore } from '../stores/images';

export const useProcessedImages = () => {
  const processedImages = useImageStore((state) => state.processedImages);
  const setProcessedImageName = useImageStore((state) => state.setProcessedImageName);

  return { processedImages, setProcessedImageName };
};
