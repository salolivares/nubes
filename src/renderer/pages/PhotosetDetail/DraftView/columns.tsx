import type { ColumnDef } from '@tanstack/react-table';
import { ImageIcon, X } from 'lucide-react';
import { useMemo } from 'react';

import { CameraCombobox } from '../../../components/CameraCombobox';
import { PhotoNameInput } from '../../../components/PhotoNameInput';
import { PhotoThumbnail } from '../../../components/PhotoThumbnail';
import { RowDragHandleCell } from '../../../components/SortableTable';
import { Button } from '../../../components/ui/button';
import type { CameraEntry } from '../../../hooks/useCameras';
import type { DbImage } from '../utils';

export function useImageColumns(opts: {
  cameras: CameraEntry[];
  onCameraSelect: (imageId: number, name: string) => void;
  onCameraAdd: (name: string) => Promise<void>;
  onNameChange: (imageId: number, name: string) => void;
  /** Photo name errors to show, keyed by row id. */
  nameErrors: ReadonlyMap<string, string>;
  onPreview: (image: DbImage) => void;
  onRemove: (image: DbImage) => void;
  disabled?: boolean;
}): ColumnDef<DbImage>[] {
  const {
    cameras,
    onCameraSelect,
    onCameraAdd,
    onNameChange,
    nameErrors,
    onPreview,
    onRemove,
    disabled,
  } = opts;

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
        cell: ({ row }) => {
          const placeholder = (
            <div className="flex h-16 w-16 items-center justify-center rounded-md bg-muted">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
          );
          if (!row.original.preview && row.original.outputs.length === 0) return placeholder;
          return (
            <button
              type="button"
              className="cursor-pointer"
              onClick={() => onPreview(row.original)}
            >
              <PhotoThumbnail
                outputs={row.original.outputs}
                preview={row.original.preview}
                alt={row.original.name}
                width={64}
                height={64}
                className="aspect-square object-cover rounded-md"
                placeholder={placeholder}
              />
            </button>
          );
        },
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <PhotoNameInput
            photoId={String(row.original.id)}
            defaultValue={row.original.name}
            error={nameErrors.get(String(row.original.id))}
            onCommit={(name) => onNameChange(row.original.id, name)}
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
    [cameras, onCameraSelect, onCameraAdd, onNameChange, nameErrors, onPreview, onRemove, disabled],
  );
}
