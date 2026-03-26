import type { ProcessedImage } from '@/common/types';

export type PhotosetWithImages = NonNullable<Awaited<ReturnType<Window['photosets']['get']>>>;
export type DbImage = PhotosetWithImages['images'][number];

/** Convert DB images back to ProcessedImage[] for the tRPC upload mutation. */
export function toProcessedImages(images: DbImage[]): ProcessedImage[] {
  return images.map((img) => ({
    id: String(img.id),
    name: img.name,
    camera: img.camera ?? undefined,
    preview: img.preview ?? undefined,
    imagePaths: img.outputs.map((o) => ({
      imagePath: o.imagePath,
      type: o.type,
      resolution: o.resolution,
      byteLength: o.byteLength,
    })),
  }));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
