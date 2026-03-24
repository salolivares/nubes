import type { FC } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import type { Album } from '@/common/types';

import { Checkbox } from '../ui/checkbox';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Input } from '../ui/input';

interface Props {
  form: UseFormReturn<Album>;
}

export const AlbumForm: FC<Props> = ({ form }) => {
  return (
    <>
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
            <FormLabel>Published</FormLabel>
            <FormControl>
              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
            <FormDescription>
              Mark this album as published in the metadata.json for downstream consumers.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
};
