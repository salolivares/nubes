import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { useProcessingImages } from '../hooks/useProcessingImages';

export const ImageProcessing = () => {
  const { files, processingImages, processed } = useProcessingImages();
  const navigate = useNavigate();

  const uploadRan = useRef(false);

  useEffect(() => {
    if (!uploadRan.current) {
      window.imageProcessor.resize(
        files.filter((file) => file.path !== undefined).map((file) => file.path)
      );
    }

    return () => {
      uploadRan.current = true;
    };
  }, []);

  useEffect(() => {
    if (processed) {
      toast.success('Images processed successfully');
    }
  }, [processed]);

  return (
    <div className="container mx-auto px-4 md:px-6 py-12">
      <div className="max-w-2xl mx-auto grid gap-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Image Processing</h1>
        </div>
        <div className="grid gap-6">
          {processingImages.map((item) => (
            <div key={item.name} className="flex items-center gap-4">
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
                  <span className="text-sm text-muted-foreground">{item.progress}%</span>
                </div>
                <Progress value={item.progress} />
              </div>
            </div>
          ))}
        </div>
        <div>
          <Button onClick={() => navigate('../s3', { relative: 'path' })}>Go to s3 upload</Button>
        </div>
      </div>
    </div>
  );
};
