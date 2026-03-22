import { useAWSCredentials } from '@client/components/AWSCredentialsForm/useAWSCredentials';
import { Button } from '@client/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@client/components/ui/card';
import { trpc } from '@client/lib/trpc';
import { KeyRound } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

function FolderIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

export const Home = () => {
  const { isSet } = useAWSCredentials();
  const { data, error } = trpc.bucket.list.useQuery(undefined, {
    enabled: !!isSet,
  });

  useEffect(() => {
    if (error) {
      toast.error('Failed to load buckets', {
        description: error.message,
      });
    }
  }, [error]);

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
              Configure your AWS credentials in Settings before browsing
              buckets.
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
      <h1>Select a folder to begin</h1>
      <div>
        {data?.map((bucket) => (
          <Link
            to={`/bucket/${bucket.Name}/picker`}
            className="group flex flex-col items-center justify-center gap-2 bg-muted rounded-lg p-4 hover:bg-muted/60 transition-colors cursor-pointer"
            key={bucket.Name}
          >
            <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
              <FolderIcon className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium">{bucket.Name}</span>
          </Link>
        ))}
      </div>
    </>
  );
};
