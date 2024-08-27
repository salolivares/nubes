import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import type { FC } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { z } from 'zod';

import type { ProcessedImage } from '@/common/types';
import { albumSchema } from '@/common/types';

import { trpc } from '../../lib/trpc';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Input } from '../ui/input';

interface Props {
  processedImages: ProcessedImage[];
}

export const AlbumForm: FC<Props> = ({ processedImages }) => {
  const { bucketName } = useParams();
  const navigate = useNavigate();

  // TODO(sal): ideally these lots of these methods should be passed from the parent component
  // we're making too many assumptions on where this component is being used

  const { mutate, isLoading } = trpc.bucket.createAlbum.useMutation({
    onError: (error) => {
      toast.error(error.message);
    },
    onSuccess: () => {
      toast.success('Album created');
      navigate('../summary', { relative: 'path', state: {} });
    },
  });

  const onSubmit = (values: z.infer<typeof albumSchema>) => {
    if (bucketName) {
      mutate({
        bucketName,
        album: values,
        images: processedImages,
      });
    } else {
      toast.error('Bucket name is required');
    }
  };

  const form = useForm<z.infer<typeof albumSchema>>({
    resolver: zodResolver(albumSchema),
    defaultValues: {
      name: '',
      location: '',
      year: new Date().getFullYear(),
      published: false,
    },
  });

  const { isDirty, isValid } = form.formState;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Album name</FormLabel>
              <FormControl>
                <Input placeholder="My awesome album" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Location</FormLabel>
              <FormControl>
                <Input placeholder="Los Angeles, California" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="year"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Year</FormLabel>
              <FormControl>
                <Input type="number" placeholder="Year" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="published"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Published?</FormLabel>
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={!isDirty || !isValid || isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Submit
        </Button>
      </form>
    </Form>
  );
};
