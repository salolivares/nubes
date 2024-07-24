import { S3 } from '@/s3';
import { S3_LIST_BUCKET_CHANNEL, S3_LIST_OBJECTS_CHANNEL } from '@common';
import { ipcMain } from 'electron';

type ListObjectsArgs = {
  bucket: string;
};

function validateArgs(args: unknown): asserts args is ListObjectsArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('Invalid arguments');
  }

  const { bucket } = args as Record<string, unknown>;

  if (typeof bucket !== 'string') {
    throw new Error('Invalid arguments');
  }
}

export function addS3EventListeners() {
  ipcMain.handle(S3_LIST_BUCKET_CHANNEL, async () => {
    try {
      const result = await S3.instance.listBuckets();
      return { success: true, data: result };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(S3_LIST_OBJECTS_CHANNEL, async (_, args) => {
    validateArgs(args);

    const { bucket } = args;

    try {
      const result = await S3.instance.listImagesInBucket(bucket);
      return { success: true, data: result };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });
}
