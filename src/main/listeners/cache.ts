import fsp from 'node:fs/promises';
import path from 'node:path';

import { app } from 'electron';

import { CACHE_GET_USAGE, PHOTOSETS_DIR } from '@/common/constants';
import { handle } from '@/main/ipc';

export interface CacheUsage {
  totalBytes: number;
  fileCount: number;
}

/**
 * Recursively walk a directory and sum file sizes.
 * Returns zeros if the directory doesn't exist.
 */
export async function getCacheUsage(dirPath: string): Promise<CacheUsage> {
  let totalBytes = 0;
  let fileCount = 0;

  try {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = await getCacheUsage(fullPath);
        totalBytes += sub.totalBytes;
        fileCount += sub.fileCount;
      } else if (entry.isFile()) {
        const stat = await fsp.stat(fullPath);
        totalBytes += stat.size;
        fileCount += 1;
      }
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { totalBytes: 0, fileCount: 0 };
    }
    throw err;
  }

  return { totalBytes, fileCount };
}

export function addCacheEventListeners() {
  handle(CACHE_GET_USAGE, () => {
    const photosetsDir = path.join(app.getPath('userData'), PHOTOSETS_DIR);
    return getCacheUsage(photosetsDir);
  });
}
