/**
 * URLs for the `nubes-media://` scheme. Main serves these from the photosets folder and from source
 * files the user picked this session (see `src/main/media/`). Anything else gets a 403 or 404.
 */
export const MEDIA_SCHEME = 'nubes-media';
export const MEDIA_HOST = 'media';

/** The only `w` the protocol accepts. Picker thumbnails are resized to this width by main. */
export const MEDIA_THUMBNAIL_WIDTH = 200;

/**
 * Build a `nubes-media://` URL for an absolute file path. The whole path is one encoded segment,
 * so the URL parser can't fold `..` segments or treat drive letters as a host.
 */
export function mediaUrl(filePath: string, opts: { width?: number } = {}): string {
  const url = `${MEDIA_SCHEME}://${MEDIA_HOST}/${encodeURIComponent(filePath)}`;
  return opts.width ? `${url}?w=${opts.width}` : url;
}
