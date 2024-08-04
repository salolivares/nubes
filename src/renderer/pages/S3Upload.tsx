import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '../components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../components/ui/form';
import { Input } from '../components/ui/input';
import { useProcessedImages } from '../hooks/useProcessedImages';
import { trpc } from '../lib/trpc';

function CheckIcon(props) {
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
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function FilePenIcon(props) {
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
      <path d="M12 22h6a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v10" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10.4 12.6a2 2 0 1 1 3 3L8 21l-4 1 1-4Z" />
    </svg>
  );
}

const albumSchema = z.object({
  albumName: z
    .string()
    .min(1, 'Album name is required')
    .max(50, 'Album name must be 50 characters or less')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Album name can only contain alphanumeric characters, underscores, and dashes'
    ),
});

export const S3Upload = () => {
  const { processedImages, setProcessedImageName } = useProcessedImages();
  const [editingId, setEditingId] = useState<string | null>(null);
  const { mutate, isLoading } = trpc.bucket.createAlbum.useMutation({
    onError: (error) => {
      toast.error(error.message);
    },
    onSuccess: () => {
      toast.success('Album created');
    },
  });

  const { bucketName } = useParams();

  const form = useForm<z.infer<typeof albumSchema>>({
    resolver: zodResolver(albumSchema),
    defaultValues: {
      albumName: '',
    },
  });

  const { isDirty, isValid } = form.formState;

  const onSubmit = (values: z.infer<typeof albumSchema>) => {
    if (bucketName) {
      mutate({ bucketName, albumName: values.albumName, images: processedImages });
    } else {
      toast.error('Bucket name is required');
    }
  };

  return (
    <div>
      <h1>S3 Uploads</h1>
      <table>
        <thead>
          <tr className="bg-muted">
            <th className="px-4 py-2 text-left">Image</th>
            <th className="px-4 py-2 text-left">Name</th>
            <th className="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {processedImages.map((image) => (
            <tr key={image.id} className="border-b hover:bg-muted/50 transition-colors">
              <td className="px-4 py-3 text-left">
                <img
                  src="/placeholder.svg"
                  alt={image.name}
                  width={64}
                  height={64}
                  className="aspect-square object-cover rounded-md"
                />
              </td>
              <td className="px-4 py-3 text-left">
                {editingId === image.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      defaultValue={image.name}
                      onBlur={(e) => setProcessedImageName(image.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setProcessedImageName(image.id, e.target.value);
                        }
                      }}
                      className="flex-1"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>{image.name}</div>
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                {editingId === image.id ? (
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                      <CheckIcon className="h-5 w-5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <Button size="icon" variant="ghost" onClick={() => setEditingId(image.id)}>
                      <FilePenIcon className="h-5 w-5" />
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            control={form.control}
            name="albumName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Album Name</FormLabel>
                <FormControl>
                  <Input placeholder="Album Name" {...field} />
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
    </div>
  );
};
