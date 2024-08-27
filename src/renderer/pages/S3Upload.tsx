import { useState } from 'react';

import { AlbumForm } from '../components/AlbumForm/AlbumForm';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useProcessedImages } from '../hooks/useProcessedImages';

function CheckIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function FilePenIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22h6a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v10" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10.4 12.6a2 2 0 1 1 3 3L8 21l-4 1 1-4Z" />
    </svg>
  );
}

export const S3Upload = () => {
  const { processedImages, setProcessedImage } = useProcessedImages();
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div>
      <h1>S3 Uploads</h1>
      <table>
        <thead>
          <tr className="bg-muted">
            <th className="px-4 py-2 text-left">Image</th>
            <th className="px-4 py-2 text-left">Name</th>
            <th className="px-4 py-2 text-left">Camera</th>
            <th className="px-4 py-2 text-right">Actions</th>
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
                {editingId === image.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      defaultValue={image.name}
                      onBlur={(e) => setProcessedImage(image.id, { name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setProcessedImage(image.id, { name: e.target.value });
                        }
                      }}
                      className="flex-1"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>{image.name}</div>
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                {editingId === image.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      defaultValue={image.camera}
                      onBlur={(e) => setProcessedImage(image.id, { camera: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setProcessedImage(image.id, { camera: e.target.value });
                        }
                      }}
                      className="flex-1"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>{image.camera}</div>
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                {editingId === image.id ? (
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                      <CheckIcon className="h-5 w-5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <Button size="icon" variant="ghost" onClick={() => setEditingId(image.id)}>
                      <FilePenIcon className="h-5 w-5" />
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <AlbumForm processedImages={processedImages} />
    </div>
  );
};
