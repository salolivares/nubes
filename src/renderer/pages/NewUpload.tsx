import { useAWSCredentials } from '@client/components/AWSCredentialsForm/useAWSCredentials';
import { Button } from '@client/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@client/components/ui/card';
import { trpc } from '@client/lib/trpc';
import { useImageStore } from '@client/stores/images';
import { Folder, KeyRound } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export const NewUpload = () => {
  const { isSet } = useAWSCredentials();
  const { data, error } = trpc.bucket.list.useQuery(undefined, {
    enabled: !!isSet,
  });
  const navigate = useNavigate();
  const reset = useImageStore((s) => s.reset);
  const setPhotosetId = useImageStore((s) => s.setPhotosetId);

  // Reset store when starting a new upload
  useEffect(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    if (error) {
      toast.error('Failed to load buckets', {
        description: error.message,
      });
    }
  }, [error]);

  const handleBucketSelect = useCallback(
    async (bucketName: string) => {
      try {
        const photoset = await window.photosets.create({
          name: `Upload ${new Date().toLocaleDateString()}`,
          bucketName,
        });
        setPhotosetId(photoset.id);
        navigate(`/bucket/${bucketName}/picker`);
      } catch (err) {
        toast.error('Failed to create photoset', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
    [navigate, setPhotosetId]
  );

  if (!isSet) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <KeyRound className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>AWS credentials required</CardTitle>
            <CardDescription>
              Configure your AWS credentials in Settings before browsing buckets.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild>
              <Link to="/settings">Go to Settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Select a bucket to begin
      </h1>
      <div className="space-y-3">
        {data?.map((bucket) => (
          <button
            type="button"
            onClick={() => handleBucketSelect(bucket.Name!)}
            className="group flex w-full flex-col items-center justify-center gap-2 rounded-lg bg-muted p-4 transition-colors hover:bg-muted/60"
            key={bucket.Name}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Folder className="h-6 w-6" />
            </div>
            <span className="text-sm font-medium">{bucket.Name}</span>
          </button>
        ))}
      </div>
    </>
  );
};
