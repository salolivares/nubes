import { S3_CREATE_ALBUM, S3_IS_MOCK, S3_LIST_BUCKETS } from '@/common';
import { s3CreateAlbumArgsSchema } from '@/common/types';
import { getS3Provider, MockS3 } from '@/main/drivers/s3';
import { handle } from '@/main/ipc';
import { mediaAccess } from '@/main/media';
import { assertUploadPaths } from '@/main/media/guards';

export function addS3EventListeners() {
  handle(S3_IS_MOCK, () => getS3Provider() instanceof MockS3);
  handle(S3_LIST_BUCKETS, () => getS3Provider().listBuckets());
  // Checked here, before either provider (real S3 or MockS3) reads a file.
  handle(S3_CREATE_ALBUM, s3CreateAlbumArgsSchema, async (_, args) => {
    await assertUploadPaths(mediaAccess, args.images);
    return getS3Provider().createAlbum(args.bucketName, args.album, args.images);
  });
}
