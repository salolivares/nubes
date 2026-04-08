import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@client/components/ui/alert-dialog';
import { Button } from '@client/components/ui/button';
import { Skeleton } from '@client/components/ui/skeleton';
import { HardDrive, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { formatBytes, formatDate } from './PhotosetDetail/utils';

type PhotosetRow = Awaited<ReturnType<Window['photosets']['list']>>[number];

interface CacheUsage {
  totalBytes: number;
  fileCount: number;
}

export const StorageSettings = () => {
  const [usage, setUsage] = useState<CacheUsage | null>(null);
  const [photosets, setPhotosets] = useState<PhotosetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [u, ps] = await Promise.all([
        window.cache.getUsage(),
        window.photosets.list({ sortBy: 'createdAt', sortOrder: 'desc' }),
      ]);
      setUsage(u);
      setPhotosets(ps.filter((p) => p.uploadedAt));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await window.photosets.delete({ id });
      await refresh();
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      await Promise.all(photosets.map((p) => window.photosets.delete({ id: p.id })));
      await refresh();
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <div className="grid gap-6">
      {/* Cache overview */}
      <div className="rounded-lg border p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
            <HardDrive className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-medium">Image Cache</h3>
            {loading ? (
              <Skeleton className="mt-1 h-4 w-32" />
            ) : usage ? (
              <p className="text-sm text-muted-foreground">
                {formatBytes(usage.totalBytes)} across {usage.fileCount}{' '}
                {usage.fileCount === 1 ? 'file' : 'files'}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Uploaded photosets list */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h3 className="text-sm font-medium">Uploaded Photosets</h3>
            <p className="text-xs text-muted-foreground">
              These photosets have been uploaded and their local cache can be
              safely deleted.
            </p>
          </div>
          {photosets.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="destructive" size="sm" disabled={deletingAll} />
                }
              >
                {deletingAll ? 'Deleting...' : 'Delete All'}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete all uploaded photosets?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete {photosets.length} uploaded{' '}
                    {photosets.length === 1 ? 'photoset' : 'photosets'} and
                    their cached images from disk. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={handleDeleteAll}>
                    Delete All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {loading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : photosets.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No uploaded photosets to clean up.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {photosets.map((ps) => (
              <li
                key={ps.id}
                className="flex items-center justify-between px-6 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{ps.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ps.images.length}{' '}
                    {ps.images.length === 1 ? 'image' : 'images'}
                    {ps.uploadedAt && (
                      <> &middot; Uploaded {formatDate(ps.uploadedAt)}</>
                    )}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deleting === ps.id}
                      />
                    }
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete "{ps.name}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this photoset and its
                        cached images from disk. The uploaded version in S3 is
                        not affected.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => handleDelete(ps.id)}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
