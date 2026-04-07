import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

export function ImagePreviewDialog({
  image,
  onClose,
}: {
  image: { name: string; preview?: string | null } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl p-2">
        <DialogTitle className="sr-only">{image?.name ?? 'Image preview'}</DialogTitle>
        {image?.preview && (
          <img
            src={`data:image/jpeg;base64,${image.preview}`}
            alt={image.name}
            className="w-full rounded-lg object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
