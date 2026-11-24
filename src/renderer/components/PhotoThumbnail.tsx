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
  // Count failures per set of sources, so new outputs (a refetch, a reused row) start fresh.
  const key = sources.join('\n');
  const [failures, setFailures] = useState({ key, count: 0 });
  const failed = failures.key === key ? failures.count : 0;
  const src = sources[failed];

  if (!src) return <>{placeholder}</>;
  return <img {...imgProps} src={src} onError={() => setFailures({ key, count: failed + 1 })} />;
}
