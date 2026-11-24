import { mediaUrl } from '@/common/media-url';

interface Output {
  imagePath: string;
  type: string;
  resolution: number;
}

/** The smallest processed jpg, served from the photosets folder over nubes-media://. */
export function thumbnailUrl(outputs: Output[]): string | undefined {
  const smallest = outputs
    .filter((o) => o.type === 'jpg')
    .sort((a, b) => a.resolution - b.resolution)[0];
  return smallest ? mediaUrl(smallest.imagePath) : undefined;
}

/** The base64 128px jpg saved in the DB. Used when the processed files are gone from disk. */
export function previewDataUrl(preview?: string | null): string | undefined {
  return preview ? `data:image/jpeg;base64,${preview}` : undefined;
}
