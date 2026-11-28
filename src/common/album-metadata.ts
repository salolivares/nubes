import { z } from 'zod';

import { photoNameError } from './photo-names';
import { slugify } from './utils';

/**
 * The album JSON the site reads. Mirrors the `travel` collection in salolivares/salolivares.com,
 * `src/content.config.ts`, field for field. Change both together.
 */
export const travelAlbumSchema = z.object({
  title: z.string(),
  description: z.string(),
  location: z.string().optional(),
  year: z.number(),
  // Sorts albums within the same year, newest first.
  month: z.number().int().min(1).max(12).optional(),
  published: z.boolean().default(false),
  images: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      camera: z.string().optional(),
    }),
  ),
});

export type TravelAlbum = z.infer<typeof travelAlbumSchema>;

interface AlbumFields {
  name: string;
  description: string;
  location: string;
  year: number;
  month?: number | null;
  published: boolean;
}

interface AlbumImageFields {
  name: string;
  camera?: string | null;
}

/**
 * The album's id on the site: `{year}-{slug(location)}`. The site takes the id from the JSON
 * filename and builds image URLs as `{id}/{image id}_{size}.{ext}`, so the S3 prefix and the
 * filename must both come from here.
 */
export function albumId(album: { year: number; location: string }): string {
  return `${album.year}-${slugify(album.location)}`;
}

/** `{albumId}.json`, the filename the site expects in `src/content/travel/`. */
export function albumMetadataFilename(album: { year: number; location: string }): string {
  return `${albumId(album)}.json`;
}

/** An image's id in the album JSON, and the stem of its file names in S3. */
export function albumImageId(name: string): string {
  return slugify(name);
}

export class AlbumMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlbumMetadataError';
  }
}

/**
 * Build the album JSON and check it against the site's schema. Throws `AlbumMetadataError` with a
 * readable message when the album would break the site build.
 */
export function buildAlbumMetadata(album: AlbumFields, images: AlbumImageFields[]): TravelAlbum {
  const metadata = {
    title: album.name,
    description: album.description,
    location: album.location,
    year: album.year,
    ...(album.month == null ? {} : { month: album.month }),
    published: album.published,
    images: images.map((image) => ({
      id: albumImageId(image.name),
      name: image.name,
      // The site's schema allows a missing camera, not a null or empty one.
      ...(image.camera ? { camera: image.camera } : {}),
    })),
  };

  const result = travelAlbumSchema.safeParse(metadata);
  if (!result.success) {
    throw new AlbumMetadataError(
      `Album metadata doesn't match the site's schema:\n${z.prettifyError(result.error)}`,
    );
  }

  // The schema can't see these, but each one breaks the site's image URLs.
  if (!Number.isInteger(album.year) || slugify(album.location) === '') {
    throw new AlbumMetadataError(
      `Can't build an album id from year "${album.year}" and location "${album.location}". ` +
        'Use a whole year and a location with at least one letter or number.',
    );
  }
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { id } of result.data.images) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  if (duplicates.size > 0) {
    throw new AlbumMetadataError(
      `Photos must have different names. These names clash, so their files would overwrite each ` +
        `other in S3: ${[...duplicates].map((id) => `"${id}"`).join(', ')}`,
    );
  }

  return result.data;
}

/**
 * Throws `AlbumMetadataError` when a photo's name is empty or still its file name. Both S3
 * providers call it before uploading; the renderer blocks upload the same way. Not part of
 * `buildAlbumMetadata`, so albums uploaded before this rule can still be exported.
 */
export function assertPhotosNamed(
  images: readonly { name: string; imagePaths: readonly { imagePath: string }[] }[],
): void {
  const unnamed = images.flatMap((image, i) => {
    const error = photoNameError(
      image.name,
      image.imagePaths.map((p) => p.imagePath),
    );
    return error ? [`photo ${i + 1} ("${image.name.trim()}")`] : [];
  });
  if (unnamed.length > 0) {
    throw new AlbumMetadataError(
      `Every photo needs a name that isn't its file name. Name these before uploading: ` +
        unnamed.join(', '),
    );
  }
}

/** Pretty-printed with a trailing newline, like the files in the site repo. */
export function serializeAlbumMetadata(metadata: TravelAlbum): string {
  return `${JSON.stringify(metadata, null, 2)}\n`;
}
