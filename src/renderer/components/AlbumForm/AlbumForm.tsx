import type { FC } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Controller } from 'react-hook-form';

import type { Album } from '@/common/types';

import { Checkbox } from '../ui/checkbox';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';

interface Props {
  form: UseFormReturn<Album>;
}

export const AlbumForm: FC<Props> = ({ form }) => {
  return (
    <FieldGroup>
      <Controller
        control={form.control}
        name="name"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="name">Album name</FieldLabel>
            <Input id="name" placeholder="My awesome album" {...field} value={field.value ?? ''} />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="location"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="location">Location</FieldLabel>
            <Input id="location" placeholder="Los Angeles, California" {...field} value={field.value ?? ''} />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="year"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="year">Year</FieldLabel>
            <Input
              id="year"
              type="number"
              placeholder="Year"
              {...field}
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.valueAsNumber)}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="published"
        render={({ field, fieldState }) => (
          <Field orientation="horizontal" data-invalid={fieldState.invalid}>
            <Checkbox id="published" checked={field.value} onCheckedChange={field.onChange} />
            <FieldLabel htmlFor="published" className="font-normal">
              Published
              <FieldDescription>
                Mark this album as published in the album metadata for downstream consumers.
              </FieldDescription>
            </FieldLabel>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
    </FieldGroup>
  );
};
