import { Button } from '@client/components/ui/button';
import { ACCESS_KEY_ID, AWS_REGION, SECRET_ACCESS_KEY } from '@common';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@ui/field';
import { Input } from '@ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/select';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  ERROR_ON_SAVE_MESSAGE,
  INVALID_ACCESS_KEY_ID_MESSAGE,
  INVALID_SECRET_ACCESS_KEY_MESSAGE,
  SUCCESS_ON_SAVE_MESSAGE,
} from './constants';
import { useAWSCredentials } from './useAWSCredentials';

const AWS_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'af-south-1',
  'ap-east-1',
  'ap-south-1',
  'ap-south-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-southeast-3',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'ca-central-1',
  'eu-central-1',
  'eu-central-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-south-1',
  'eu-south-2',
  'eu-north-1',
  'me-south-1',
  'me-central-1',
  'sa-east-1',
] as const;

const awsCredentialsSchema = z.object({
  accessKeyId: z.string().regex(/^AKIA[0-9A-Z]{16}$/, INVALID_ACCESS_KEY_ID_MESSAGE),
  secretAccessKey: z.string().regex(/^[0-9a-zA-Z/+]{40}$/, INVALID_SECRET_ACCESS_KEY_MESSAGE),
  awsRegion: z.string().min(1),
});

export const AWSCredentialsForm: FC = () => {
  const { accessKeyId, secretAccessKey, awsRegion } = useAWSCredentials();

  const form = useForm<z.infer<typeof awsCredentialsSchema>>({
    resolver: zodResolver(awsCredentialsSchema),
    defaultValues: {
      accessKeyId,
      secretAccessKey,
      awsRegion,
    },
    mode: 'onChange',
  });

  const [showAccessKeyId, setShowAccessKeyId] = useState(false);
  const [showSecretAccessKey, setShowSecretAccessKey] = useState(false);

  useEffect(() => {
    form.reset({
      accessKeyId,
      secretAccessKey,
      awsRegion,
    });
  }, [accessKeyId, secretAccessKey, awsRegion, form]);

  const { isDirty, isValid } = form.formState;

  async function onSubmit(values: z.infer<typeof awsCredentialsSchema>) {
    try {
      await window.storage.secureWrite(ACCESS_KEY_ID, values.accessKeyId);
      await window.storage.secureWrite(SECRET_ACCESS_KEY, values.secretAccessKey);
      await window.storage.write(AWS_REGION, values.awsRegion);
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
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <CardContent className="pb-6">
          <FieldGroup>
          <Controller
            control={form.control}
            name="accessKeyId"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="accessKeyId">Access Key ID</FieldLabel>
                <Input
                  id="accessKeyId"
                  placeholder="Access Key ID"
                  {...field}
                  type={showAccessKeyId ? 'text' : 'password'}
                  onFocus={() => setShowAccessKeyId(true)}
                  onBlur={() => setShowAccessKeyId(false)}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="secretAccessKey"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="secretAccessKey">Secret Access Key</FieldLabel>
                <Input
                  id="secretAccessKey"
                  placeholder="Secrets access key"
                  {...field}
                  type={showSecretAccessKey ? 'text' : 'password'}
                  onFocus={() => setShowSecretAccessKey(true)}
                  onBlur={() => setShowSecretAccessKey(false)}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="awsRegion"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="awsRegion">Region</FieldLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger id="awsRegion">
                    <SelectValue placeholder="Select a region" />
                  </SelectTrigger>
                  <SelectContent>
                    {AWS_REGIONS.map((region) => (
                      <SelectItem key={region} value={region}>
                        {region}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          </FieldGroup>
        </CardContent>
        <CardFooter className="border-t px-6 py-4">
          <Button type="submit" disabled={!isDirty || !isValid}>
            Save
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};
