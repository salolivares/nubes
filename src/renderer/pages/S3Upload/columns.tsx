import type { ColumnDef } from '@tanstack/react-table';
import { ImageIcon } from 'lucide-react';
import { useMemo } from 'react';

import type { ProcessedImage } from '@/common/types';

import { CameraCombobox } from '../../components/CameraCombobox';
import { PhotoNameInput } from '../../components/PhotoNameInput';
import { PhotoThumbnail } from '../../components/PhotoThumbnail';
import { RowDragHandleCell } from '../../components/SortableTable';
import type { CameraEntry } from '../../hooks/useCameras';

export function useImageColumns(opts: {
  cameras: CameraEntry[];
  onCameraSelect: (imageId: string, name: string) => void;
  onCameraAdd: (name: string) => Promise<void>;
  onNameChange: (imageId: string, name: string) => void;
  /** Photo name errors to show, keyed by row id. */
  nameErrors: ReadonlyMap<string, string>;
  onPreview: (image: ProcessedImage) => void;
}): ColumnDef<ProcessedImage>[] {
  const { cameras, onCameraSelect, onCameraAdd, onNameChange, nameErrors, onPreview } = opts;

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
          <button type="button" className="cursor-pointer" onClick={() => onPreview(row.original)}>
            <PhotoThumbnail
              outputs={row.original.imagePaths}
              preview={row.original.preview}
              alt={row.original.name}
              width={64}
              height={64}
              className="aspect-square object-cover rounded-md"
              placeholder={
                <div className="flex h-16 w-16 items-center justify-center rounded-md bg-muted">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                </div>
              }
            />
          </button>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <PhotoNameInput
            photoId={row.original.id}
            defaultValue={row.original.name}
            error={nameErrors.get(row.original.id)}
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
    ],
    [cameras, onCameraSelect, onCameraAdd, onNameChange, nameErrors, onPreview],
  );
}
