import { useProcessedImages } from '../hooks/useProcessedImages';

export const S3Upload = () => {
  const { processedImages } = useProcessedImages();
  console.log('Processed images', processedImages);

  return (
    <div>
      <h1>S3 Uploads</h1>
      <div>
        {processedImages.map((image) => {
          const imagePath = 'file://' + image.imagePaths[0].imagePath;

          return (
            <div key={image.name}>
              <img src={imagePath} alt={`${image.name}`} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
