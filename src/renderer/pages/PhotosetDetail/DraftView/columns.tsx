import type { ColumnDef } from '@tanstack/react-table';
import { ImageIcon, X } from 'lucide-react';
import { useMemo } from 'react';

import { CameraCombobox } from '../../../components/CameraCombobox';
import { RowDragHandleCell } from '../../../components/SortableTable';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import type { CameraEntry } from '../../../hooks/useCameras';
import type { DbImage } from '../utils';

export function useImageColumns(opts: {
  cameras: CameraEntry[];
  onCameraSelect: (imageId: number, name: string) => void;
  onCameraAdd: (name: string) => Promise<void>;
  onNameChange: (imageId: number, name: string) => void;
  onPreview: (image: DbImage) => void;
  onRemove: (image: DbImage) => void;
  disabled?: boolean;
}): ColumnDef<DbImage>[] {
  const { cameras, onCameraSelect, onCameraAdd, onNameChange, onPreview, onRemove, disabled } = opts;

  return useMemo<ColumnDef<DbImage>[]>(
    () => [
      {
        id: 'drag-handle',
        header: () => null,
        size: 40,
        cell: () => <RowDragHandleCell />,
      },
      {
        id: 'thumbnail',
        header: 'Image',
        size: 80,
        cell: ({ row }) =>
          row.original.preview ? (
            <button
              type="button"
              className="cursor-pointer"
              onClick={() => onPreview(row.original)}
            >
              <img
                src={`data:image/jpeg;base64,${row.original.preview}`}
                alt={row.original.name}
                width={64}
                height={64}
                className="aspect-square object-cover rounded-md"
              />
            </button>
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-md bg-muted">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
          ),
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <Input
            type="text"
            defaultValue={row.original.name}
            onBlur={(e) => onNameChange(row.original.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onNameChange(row.original.id, (e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="border-transparent bg-transparent shadow-none hover:border-input focus:border-input focus:bg-background"
          />
        ),
      },
      {
        accessorKey: 'camera',
        header: 'Camera',
        cell: ({ row }) => (
          <CameraCombobox
            value={row.original.camera ?? ''}
            cameras={cameras}
            onSelect={(name) => onCameraSelect(row.original.id, name)}
            onAdd={onCameraAdd}
          />
        ),
      },
      {
        id: 'remove',
        header: () => null,
        size: 40,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(row.original)}
          >
            <X className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [cameras, onCameraSelect, onCameraAdd, onNameChange, onPreview, onRemove, disabled],
  );
}
