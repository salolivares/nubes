import { useEffect, useState } from 'react';

import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

export function pickPreviewPath(
  outputs: { imagePath: string; type: string; resolution: number }[],
): string | undefined {
  return (
    outputs.find((o) => o.resolution === 1280 && o.type === 'jpg') ??
    outputs.find((o) => o.type === 'jpg' && o.resolution >= 640)
  )?.imagePath;
}

export function ImagePreviewDialog({
  image,
  previewPath,
  onClose,
}: {
  image: { name: string; preview?: string | null } | null;
  previewPath?: string;
  onClose: () => void;
}) {
  const [hiResSrc, setHiResSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!previewPath) {
      setHiResSrc(null);
      return;
    }

    let cancelled = false;
    window.imagePicker.readPreview(previewPath).then((dataUrl) => {
      if (!cancelled) setHiResSrc(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [previewPath]);

  const thumbnailSrc = image?.preview ? `data:image/jpeg;base64,${image.preview}` : null;
  const src = hiResSrc ?? thumbnailSrc;

  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl p-2">
        <DialogTitle className="sr-only">{image?.name ?? 'Image preview'}</DialogTitle>
        {src && (
          <img
            src={src}
            alt={image?.name ?? 'Image preview'}
            className="w-full rounded-lg object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
