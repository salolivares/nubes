import { AlbumForm } from '../components/AlbumForm/AlbumForm';
import { Input } from '../components/ui/input';
import { useProcessedImages } from '../hooks/useProcessedImages';

export const S3Upload = () => {
  const { processedImages, setProcessedImage } = useProcessedImages();

  return (
    <div>
      <h1>S3 Uploads</h1>
      <table>
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
                <Input
                  type="text"
                  defaultValue={image.camera}
                  placeholder="No camera"
                  onBlur={(e) => setProcessedImage(image.id, { camera: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setProcessedImage(image.id, { camera: (e.target as HTMLInputElement).value });
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="border-transparent bg-transparent shadow-none hover:border-input focus:border-input focus:bg-background"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <AlbumForm processedImages={processedImages} />
    </div>
  );
};
