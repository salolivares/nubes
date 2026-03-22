import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { FallbackProps } from 'react-error-boundary';

import { Button } from './ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card';

function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return undefined;
}

export function AppErrorFallback({ error }: FallbackProps) {
  const message = getErrorMessage(error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Something went wrong
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            An unexpected error crashed the application.
          </p>
          {message && (
            <pre className="mt-3 max-h-32 overflow-auto rounded bg-muted p-3 text-xs">
              {message}
            </pre>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reload app
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export function RouteErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message = getErrorMessage(error);
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Something went wrong
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This page encountered an error. The rest of the app should still work.
        </p>
        {message && (
          <pre className="mt-3 max-h-32 overflow-auto rounded bg-muted p-3 text-xs">
            {message}
          </pre>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={resetErrorBoundary}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </CardFooter>
    </Card>
  );
}
