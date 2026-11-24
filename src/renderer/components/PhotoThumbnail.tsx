import type { ImgHTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';

import { previewDataUrl, thumbnailUrl } from '../lib/media';

/**
 * A photoset image thumbnail. Loads the processed jpg over nubes-media:// and falls back to the
 * base64 preview stored in the DB if that fails, then to `placeholder`.
 */
export function PhotoThumbnail({
  outputs,
  preview,
  placeholder = null,
  ...imgProps
}: {
  outputs: { imagePath: string; type: string; resolution: number }[];
  preview?: string | null;
  placeholder?: ReactNode;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const sources = [thumbnailUrl(outputs), previewDataUrl(preview)].filter((s): s is string => !!s);
  const [failed, setFailed] = useState(0);
  const src = sources[failed];

  if (!src) return <>{placeholder}</>;
  return <img {...imgProps} src={src} onError={() => setFailed((n) => n + 1)} />;
}
