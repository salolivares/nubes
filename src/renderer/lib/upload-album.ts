import type { S3CreateAlbumArgs } from '@/common/types';

/**
 * Upload an album to S3. Real S3 reports failed puts as `{ success: false }` instead of throwing,
 * so turn that into an error. Callers must never record a failed upload in the DB.
 */
export async function uploadAlbum(args: S3CreateAlbumArgs) {
  const result = await window.s3.createAlbum(args);
  if (!result.success) {
    throw new Error('Upload to S3 failed. Some files may already be in the bucket. Try again.');
  }
  return result;
}
