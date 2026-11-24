import { useState } from 'react';

import { mediaUrl } from '@/common/media-url';

import { previewDataUrl } from '../lib/media';
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
  // The hi-res jpg streams from the photosets folder over nubes-media://. If it's gone from disk,
  // fall back to the 128px preview saved in the DB.
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const hiResSrc = previewPath && previewPath !== failedPath ? mediaUrl(previewPath) : undefined;
  const src = hiResSrc ?? previewDataUrl(image?.preview);

  return (
    <Dialog
      open={!!image}
      onOpenChange={(open) => {
        if (open) return;
        // Retry the hi-res file next time, in case it was regenerated at the same path.
        setFailedPath(null);
        onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl p-2">
        <DialogTitle className="sr-only">{image?.name ?? 'Image preview'}</DialogTitle>
        {src && (
          <img
            src={src}
            onError={() => {
              if (hiResSrc) setFailedPath(previewPath ?? null);
            }}
            alt={image?.name ?? 'Image preview'}
            className="w-full rounded-lg object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
