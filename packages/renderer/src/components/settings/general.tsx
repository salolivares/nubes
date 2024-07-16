import { useForm } from 'react-hook-form';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Input } from '../ui/input';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const awsCredentialsSchema = z.object({
  accessKeyId: z.string().regex(/^AKIA[0-9A-Z]{16}$/, 'Invalid AWS Access Key ID format'),
  secretAccessKey: z.string().regex(/^[0-9a-zA-Z/+]{40}$/, 'Invalid AWS Secret Access Key format'),
});

const AWSCredentialsForm = () => {
  const form = useForm<z.infer<typeof awsCredentialsSchema>>({
    resolver: zodResolver(awsCredentialsSchema),
    defaultValues: {
      accessKeyId: '',
      secretAccessKey: '',
    },
    mode: 'onTouched',
  });

  const { isDirty, isValid } = form.formState;

  function onSubmit(values: z.infer<typeof awsCredentialsSchema>) {
    // Do something with the form values.
    // ✅ This will be type-safe and validated.
    console.log(values);
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
                    <Input placeholder="Access Key ID" {...field} />
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
                    <Input placeholder="Secrets access key" {...field} />
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

export const GeneralSettings = () => {
  return (
    <div className="grid gap-6">
      <AWSCredentialsForm />
    </div>
  );
};
