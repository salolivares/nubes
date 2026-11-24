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
import {
  cacheKeys,
  cacheUsageQuery,
  forgetPhotosets,
  localNetworkMode,
  photosetKeys,
  photosetListQuery,
} from '@client/lib/photoset-queries';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HardDrive, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { formatBytes, formatDate } from './PhotosetDetail/utils';

export const StorageSettings = () => {
  const queryClient = useQueryClient();
  const usageQuery = useQuery(cacheUsageQuery());
  // Same key as Home's default sort, so the two pages share one cached list.
  const photosetsQuery = useQuery({
    ...photosetListQuery({ sortBy: 'createdAt', sortOrder: 'desc' }),
    select: (rows) => rows.filter((p) => p.uploadedAt),
  });
  const photosets = photosetsQuery.data ?? [];
  const usage = usageQuery.data;

  const deletePhotosets = useMutation({
    mutationFn: ({ ids }: { ids: number[]; all: boolean }) =>
      Promise.all(ids.map((id) => window.photosets.delete({ id }))).then(() => undefined),
    networkMode: localNetworkMode,
    onSuccess: (_data, { ids }) => forgetPhotosets(queryClient, ids),
    onError: (err) => {
      toast.error('Failed to delete', { description: err.message || 'Unknown error' });
      // Some deletes may have gone through. Reload the lists and usage from disk.
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: photosetKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: cacheKeys.all }),
      ]);
    },
  });

  // One mutation behind every delete button, disabled while it runs, so deletes never overlap.
  const busy = deletePhotosets.isPending;
  const deletingAll = busy && deletePhotosets.variables.all;
  const handleDelete = (id: number) => deletePhotosets.mutate({ ids: [id], all: false });
  const handleDeleteAll = () =>
    deletePhotosets.mutate({ ids: photosets.map((p) => p.id), all: true });

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
            {usageQuery.isPending ? (
              <Skeleton className="mt-1 h-4 w-32" />
            ) : usage ? (
              <p className="text-sm text-muted-foreground">
                {formatBytes(usage.totalBytes)} across {usage.fileCount}{' '}
                {usage.fileCount === 1 ? 'file' : 'files'}
              </p>
            ) : (
              <p className="text-sm text-destructive">Couldn't read cache usage</p>
            )}
          </div>
        </div>
      </div>

      {/* Uploaded photosets list */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h3 className="text-sm font-medium">Uploaded Photosets</h3>
            <p className="text-xs text-muted-foreground">
              These photosets have been uploaded and their local cache can be safely deleted.
            </p>
          </div>
          {photosets.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button variant="destructive" size="sm" disabled={busy} />}
              >
                {deletingAll ? 'Deleting...' : 'Delete All'}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete all uploaded photosets?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete {photosets.length} uploaded{' '}
                    {photosets.length === 1 ? 'photoset' : 'photosets'} and their cached images from
                    disk. This cannot be undone.
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

        {photosetsQuery.isPending ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !photosetsQuery.data ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <p className="text-sm font-medium text-destructive">
              {photosetsQuery.error?.message || 'Failed to load photosets'}
            </p>
            <Button variant="outline" size="sm" onClick={() => photosetsQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : photosets.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No uploaded photosets to clean up.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {photosets.map((ps) => (
              <li key={ps.id} className="flex items-center justify-between px-6 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{ps.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ps.images.length} {ps.images.length === 1 ? 'image' : 'images'}
                    {ps.uploadedAt && <> &middot; Uploaded {formatDate(ps.uploadedAt)}</>}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="ghost" size="sm" disabled={busy} />}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete "{ps.name}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this photoset and its cached images from disk.
                        The uploaded version in S3 is not affected.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => handleDelete(ps.id)}>
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
