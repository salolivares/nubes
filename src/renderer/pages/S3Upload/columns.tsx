import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';

import type { ProcessedImage } from '@/common/types';

import { CameraCombobox } from '../../components/CameraCombobox';
import { RowDragHandleCell } from '../../components/SortableTable';
import { Input } from '../../components/ui/input';
import type { CameraEntry } from '../../hooks/useCameras';

export function useImageColumns(opts: {
  cameras: CameraEntry[];
  onCameraSelect: (imageId: string, name: string) => void;
  onCameraAdd: (name: string) => Promise<void>;
  onNameChange: (imageId: string, name: string) => void;
  onPreview: (image: ProcessedImage) => void;
}): ColumnDef<ProcessedImage>[] {
  const { cameras, onCameraSelect, onCameraAdd, onNameChange, onPreview } = opts;

  return useMemo<ColumnDef<ProcessedImage>[]>(
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
        cell: ({ row }) => (
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
    ],
    [cameras, onCameraSelect, onCameraAdd, onNameChange, onPreview],
  );
}
