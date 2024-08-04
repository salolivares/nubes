import { Button } from '@client/components/ui/button';
import { ACCESS_KEY_ID, SECRET_ACCESS_KEY } from '@common';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@ui/form';
import { Input } from '@ui/input';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  ERROR_ON_SAVE_MESSAGE,
  INVALID_ACCESS_KEY_ID_MESSAGE,
  INVALID_SECRET_ACCESS_KEY_MESSAGE,
  SUCCESS_ON_SAVE_MESSAGE,
} from './constants';
import { useAWSCredentials } from './useAWSCredentials';

interface AWSCredentialsFormProps {
  accessKeyId?: string;
  secretAccessKey?: string;
}

const awsCredentialsSchema = z.object({
  accessKeyId: z.string().regex(/^AKIA[0-9A-Z]{16}$/, INVALID_ACCESS_KEY_ID_MESSAGE),
  secretAccessKey: z.string().regex(/^[0-9a-zA-Z/+]{40}$/, INVALID_SECRET_ACCESS_KEY_MESSAGE),
});

export const AWSCredentialsForm: FC<AWSCredentialsFormProps> = () => {
  const { accessKeyId, secretAccessKey } = useAWSCredentials();

  const form = useForm<z.infer<typeof awsCredentialsSchema>>({
    resolver: zodResolver(awsCredentialsSchema),
    defaultValues: {
      accessKeyId,
      secretAccessKey,
    },
    mode: 'onChange',
  });

  const [showAccessKeyId, setShowAccessKeyId] = useState(false);
  const [showSecretAccessKey, setShowSecretAccessKey] = useState(false);

  useEffect(() => {
    form.reset({
      accessKeyId,
      secretAccessKey,
    });
  }, [accessKeyId, secretAccessKey, form]);

  const { isDirty, isValid } = form.formState;

  async function onSubmit(values: z.infer<typeof awsCredentialsSchema>) {
    try {
      await window.storage.secureWrite(ACCESS_KEY_ID, values.accessKeyId);
      await window.storage.secureWrite(SECRET_ACCESS_KEY, values.secretAccessKey);
      toast.success(SUCCESS_ON_SAVE_MESSAGE);
    } catch (error) {
      console.log(ERROR_ON_SAVE_MESSAGE, error);
      toast.error(ERROR_ON_SAVE_MESSAGE);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AWS Credentials</CardTitle>
        <CardDescription>
          Used to retrieve and save images to s3 buckets. Click here to figure to learn how to
          create AWS credentials safely.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="grid gap-6">
            <FormField
              control={form.control}
              name="accessKeyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Access Key ID</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Access Key ID"
                      {...field}
                      type={showAccessKeyId ? 'text' : 'password'}
                      onFocus={() => setShowAccessKeyId(true)}
                      onBlur={() => setShowAccessKeyId(false)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="secretAccessKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Secret Access Key</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Secrets access key"
                      {...field}
                      type={showSecretAccessKey ? 'text' : 'password'}
                      onFocus={() => setShowSecretAccessKey(true)}
                      onBlur={() => setShowSecretAccessKey(false)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={!isDirty || !isValid}>
              Save
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
};
