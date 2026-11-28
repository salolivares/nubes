import { Badge } from '@client/components/ui/badge';
import { Button } from '@client/components/ui/button';
import { githubKeys, githubSettingsQuery, localNetworkMode } from '@client/lib/photoset-queries';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@ui/field';
import { Input } from '@ui/input';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import type { GitHubConnectionResult } from '@/common/types';
import {
  DEFAULT_GITHUB_SETTINGS,
  githubBranchSchema,
  githubRepoSchema,
  githubTokenSchema,
} from '@/common/types';

// Main never sends the saved token back, so the field always starts empty. Empty keeps it.
const formSchema = z.object({
  token: z.union([z.literal(''), githubTokenSchema]),
  repo: githubRepoSchema,
  baseBranch: githubBranchSchema,
});

type FormValues = z.infer<typeof formSchema>;

/**
 * The token and target repo for album PRs. The token is saved encrypted in main, and the page only
 * ever learns whether one is saved.
 */
export const GitHubSettingsForm = () => {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery(githubSettingsQuery());
  const [showToken, setShowToken] = useState(false);
  const [connection, setConnection] = useState<GitHubConnectionResult | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: { token: '', ...DEFAULT_GITHUB_SETTINGS },
  });

  useEffect(() => {
    if (settings) form.reset({ token: '', repo: settings.repo, baseBranch: settings.baseBranch });
  }, [settings, form]);

  const onSaved = (next: Awaited<ReturnType<Window['github']['settings']>>) => {
    queryClient.setQueryData(githubKeys.settings(), next);
    setConnection(null);
  };

  const save = useMutation({
    mutationFn: (values: FormValues) => window.github.saveSettings(values),
    networkMode: localNetworkMode,
    onSuccess: (next) => {
      onSaved(next);
      toast.success('GitHub settings saved');
    },
    onError: (err) => toast.error('Failed to save GitHub settings', { description: err.message }),
  });

  const clear = useMutation({
    mutationFn: () => window.github.clearToken(),
    networkMode: localNetworkMode,
    onSuccess: (next) => {
      onSaved(next);
      toast.success('GitHub token removed');
    },
    onError: (err) => toast.error('Failed to remove the token', { description: err.message }),
  });

  const test = useMutation({
    mutationFn: () => window.github.testConnection(),
    onSuccess: setConnection,
    onError: (err) => setConnection({ ok: false, message: err.message, missingPermissions: [] }),
  });

  const { isDirty, isValid } = form.formState;
  const hasToken = settings?.hasToken ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Site repository
          {settings?.mock && <Badge variant="secondary">Mock GitHub</Badge>}
        </CardTitle>
        <CardDescription>
          After an upload, Nubes commits the album JSON to the site repo and opens a draft PR. Use a
          fine-grained token that can only access that repository, with Contents and Pull requests
          set to Read and write.
        </CardDescription>
      </CardHeader>
      <form
        onSubmit={form.handleSubmit((values) =>
          // The submitted values, token included, stay in the mutation's state until reset.
          save.mutate(values, { onSettled: () => save.reset() }),
        )}
      >
        <CardContent className="pb-6">
          <FieldGroup>
            <Controller
              control={form.control}
              name="token"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="githubToken">Personal access token</FieldLabel>
                  <Input
                    id="githubToken"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={
                      hasToken ? 'Saved. Paste a new token to replace it' : 'github_pat_...'
                    }
                    {...field}
                    type={showToken ? 'text' : 'password'}
                    onFocus={() => setShowToken(true)}
                    onBlur={() => {
                      setShowToken(false);
                      field.onBlur();
                    }}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="repo"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="githubRepo">Repository</FieldLabel>
                  <Input id="githubRepo" placeholder="owner/name" {...field} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="baseBranch"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="githubBaseBranch">Base branch</FieldLabel>
                  <Input id="githubBaseBranch" placeholder="master" {...field} />
                  <FieldDescription>Album PRs branch from and merge into this.</FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
          {connection && (
            <div
              role="status"
              className="mt-4 flex items-start gap-2 rounded-md border p-3 text-sm"
            >
              {connection.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
              <div className="space-y-1">
                <p>{connection.message}</p>
                {connection.missingPermissions.length > 0 && (
                  <ul className="list-disc pl-4 text-muted-foreground">
                    {connection.missingPermissions.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="gap-2 border-t px-6 py-4">
          <Button type="submit" disabled={!isDirty || !isValid || save.isPending}>
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            // Tests what's saved, so save edits first.
            disabled={test.isPending || isDirty || (!hasToken && !settings?.mock)}
            onClick={() => test.mutate()}
          >
            {test.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Test connection
          </Button>
          {hasToken && (
            <Button
              type="button"
              variant="ghost"
              disabled={clear.isPending}
              onClick={() => clear.mutate()}
            >
              Remove token
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  );
};
