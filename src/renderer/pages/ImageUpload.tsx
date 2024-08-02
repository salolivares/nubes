import { useEffect, useState } from 'react';

import { Progress } from '../components/ui/progress';
import { useImageStore } from '../stores/images';

export const ImageUpload = () => {
  const files = useImageStore((state) => state.files);
  const loadPreviews = useImageStore((state) => state.loadPreviews);
  const unloadPreviews = useImageStore((state) => state.unloadPreviews);

  useEffect(() => {
    loadPreviews();
    return () => unloadPreviews();
  }, []);

  return (
    <div className="container mx-auto px-4 md:px-6 py-12">
      <div className="max-w-2xl mx-auto grid gap-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Image Uploads</h1>
          <p className="text-muted-foreground">
            Monitor the progress of your image uploads in real-time.
          </p>
        </div>
        <div className="grid gap-6">
          {files.map((item) => (
            <div key={item.name} className="flex items-center gap-4">
              <img
                src={item.preview}
                alt={`Image ${item.name}`}
                width={80}
                height={80}
                className="rounded-md object-cover"
                style={{ aspectRatio: '80/80', objectFit: 'cover' }}
              />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-sm text-muted-foreground">0%</span>
                </div>
                <Progress value={0} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
