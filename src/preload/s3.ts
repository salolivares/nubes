import { S3_CREATE_ALBUM, S3_LIST_BUCKETS } from '@common';
import { ipcRenderer } from 'electron';

export const s3: S3Context = {
  listBuckets: () => ipcRenderer.invoke(S3_LIST_BUCKETS),
  createAlbum: (args) => ipcRenderer.invoke(S3_CREATE_ALBUM, args),
};
