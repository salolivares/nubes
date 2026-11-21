import { S3_CREATE_ALBUM, S3_IS_MOCK, S3_LIST_BUCKETS } from '@/common';
import { s3CreateAlbumArgsSchema } from '@/common/types';
import { getS3Provider, MockS3 } from '@/main/drivers/s3';
import { handle } from '@/main/ipc';

export function addS3EventListeners() {
  handle(S3_IS_MOCK, () => getS3Provider() instanceof MockS3);
  handle(S3_LIST_BUCKETS, () => getS3Provider().listBuckets());
  handle(S3_CREATE_ALBUM, s3CreateAlbumArgsSchema, (_, args) =>
    getS3Provider().createAlbum(args.bucketName, args.album, args.images),
  );
}
