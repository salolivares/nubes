import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ChevronDown, GripVertical, Loader2, Upload } from 'lucide-react';
import { createContext, type CSSProperties, useContext, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import type { Album, ProcessedImage } from '@/common/types';
import { albumSchema } from '@/common/types';

import { AlbumForm } from '../components/AlbumForm/AlbumForm';
import { CameraCombobox } from '../components/CameraCombobox';
import { Button } from '../components/ui/button';
import { ButtonGroup } from '../components/ui/button-group';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { useCameras } from '../hooks/useCameras';
import { useProcessedImages } from '../hooks/useProcessedImages';
import { trpc } from '../lib/trpc';
import { cn } from '../lib/utils';
import { useImageStore } from '../stores/images';

function toPhotosetImages(processedImages: ProcessedImage[]) {
  return processedImages.map((img, i) => ({
    name: img.name,
    camera: img.camera,
    originalPath: img.imagePaths[0]?.imagePath ?? '',
    preview: img.preview,
    sortOrder: i,
    outputs: img.imagePaths.map((p) => ({
      imagePath: p.imagePath,
      type: p.type,
      resolution: p.resolution,
      byteLength: p.byteLength,
    })),
  }));
}

// ── Sortable row context ─────────────────────────────────────────────

type SortableRowCtx = {
  attributes: ReturnType<typeof useSortable>['attributes'];
  listeners: ReturnType<typeof useSortable>['listeners'];
};

const SortableRowContext = createContext<SortableRowCtx | null>(null);

function RowDragHandleCell() {
  const ctx = useContext(SortableRowContext);
  if (!ctx) return null;
  return (
    <button type="button" className="cursor-grab touch-none" {...ctx.attributes} {...ctx.listeners}>
      <GripVertical className="text-muted-foreground" />
    </button>
  );
}

// ── Sortable row wrapper ─────────────────────────────────────────────

function DraggableRow({ row }: { row: Row<ProcessedImage> }) {
  const { transform, transition, setNodeRef, isDragging, attributes, listeners } = useSortable({
    id: row.original.id,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 1 : 0,
    position: 'relative',
  };

  return (
    <SortableRowContext.Provider value={{ attributes, listeners }}>
      <tr
        ref={setNodeRef}
        data-slot="table-row"
        className={cn('border-b transition-colors hover:bg-muted/50', isDragging && 'bg-muted')}
        style={style}
      >
        {row.getVisibleCells().map((cell) => (
          <td
            key={cell.id}
            data-slot="table-cell"
            className="p-2 align-middle whitespace-nowrap"
            style={{ width: cell.column.getSize() }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>
    </SortableRowContext.Provider>
  );
}

// ── Main page ────────────────────────────────────────────────────────

export const S3Upload = () => {
  const { bucketName } = useParams();
  const navigate = useNavigate();
  const photosetId = useImageStore((s) => s.photosetId);
  const { processedImages, setProcessedImage, setProcessedImages } = useProcessedImages();
  const { cameras, addCamera, touchCamera } = useCameras();
  const [isSaving, setIsSaving] = useState(false);
  const [imagesDirty, setImagesDirty] = useState(false);
  const [previewImage, setPreviewImage] = useState<ProcessedImage | null>(null);

  const form = useForm<Album>({
    resolver: zodResolver(albumSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      location: '',
      year: new Date().getFullYear(),
      published: false,
    },
  });

  const { mutate, isLoading: isUploading } = trpc.bucket.createAlbum.useMutation({
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const { isDirty, isValid } = form.formState;
  const busy = isUploading || isSaving;
  const canSubmit = (isDirty || imagesDirty) && isValid && !busy;

  const handleCameraSelect = (imageId: string, cameraName: string) => {
    setProcessedImage(imageId, { camera: cameraName });
    touchCamera(cameraName);
    setImagesDirty(true);
  };

  const handleCameraAdd = async (name: string) => {
    await addCamera(name);
  };

  // ── Column definitions ───────────────────────────────────────────

  const columns = useMemo<ColumnDef<ProcessedImage>[]>(
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
            onClick={() => setPreviewImage(row.original)}
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
            onBlur={(e) => {
              setProcessedImage(row.original.id, { name: e.target.value });
              setImagesDirty(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setProcessedImage(row.original.id, {
                  name: (e.target as HTMLInputElement).value,
                });
                setImagesDirty(true);
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
            onSelect={(name) => handleCameraSelect(row.original.id, name)}
            onAdd={handleCameraAdd}
          />
        ),
      },
    ],
    [cameras, handleCameraAdd, handleCameraSelect, setProcessedImage],
  );

  // ── TanStack Table ───────────────────────────────────────────────

  const table = useReactTable({
    data: processedImages,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const dataIds = useMemo(() => processedImages.map((img) => img.id), [processedImages]);

  // ── DnD sensors ──────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {}),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = dataIds.indexOf(active.id as string);
      const newIndex = dataIds.indexOf(over.id as string);
      const reordered = arrayMove(processedImages, oldIndex, newIndex);
      setProcessedImages(reordered);
      setImagesDirty(true);
    }
  };

  // ── Submit handlers ──────────────────────────────────────────────

  const handleUpload = form.handleSubmit((values) => {
    if (!bucketName) {
      toast.error('Bucket name is required');
      return;
    }

    mutate(
      { bucketName, album: values, images: processedImages },
      {
        onSuccess: async () => {
          if (photosetId) {
            try {
              await window.photosets.addImages({
                photosetId,
                images: toPhotosetImages(processedImages),
              });
              await window.photosets.update({
                id: photosetId,
                name: values.name,
                location: values.location,
                year: values.year,
              });
              await window.photosets.markUploaded({ id: photosetId });
              if (values.published) {
                await window.photosets.publish({ id: photosetId });
              }
            } catch {
              // Non-fatal: S3 upload succeeded, DB update is best-effort
            }
          }
          toast.success('Album uploaded to S3');
          navigate('../summary', { relative: 'path' });
        },
      },
    );
  });

  const handleDraft = form.handleSubmit(async (values) => {
    if (!photosetId) {
      toast.error('No photoset to save');
      return;
    }

    setIsSaving(true);
    try {
      await window.photosets.addImages({
        photosetId,
        images: toPhotosetImages(processedImages),
      });
      await window.photosets.update({
        id: photosetId,
        name: values.name,
        location: values.location,
        year: values.year,
      });
      if (values.published) {
        await window.photosets.publish({ id: photosetId });
      }
      toast.success('Draft saved');
      navigate(`/photoset/${photosetId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setIsSaving(false);
    }
  });

  return (
    <div className="p-6 md:p-10">
      {/* Header with split button */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Review & Upload</h1>
        <ButtonGroup>
          <Button disabled={!canSubmit} onClick={handleDraft}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save as Draft
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button disabled={!canSubmit} className="pl-2!" />}>
              <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleUpload}>
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload />}
                Upload to S3
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      </div>

      {/* Mass-apply camera toolbar */}
      {processedImages.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Apply to all:</span>
          <div className="w-56">
            <CameraCombobox
              value=""
              cameras={cameras}
              onSelect={(name) => {
                for (const img of processedImages) {
                  setProcessedImage(img.id, { camera: name });
                }
                touchCamera(name);
                setImagesDirty(true);
              }}
              onAdd={handleCameraAdd}
            />
          </div>
        </div>
      )}

      {/* Image table with drag-and-drop reordering */}
      <DndContext
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        sensors={sensors}
        onDragEnd={handleDragEnd}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} style={{ width: header.getSize() }}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            <SortableContext items={dataIds} strategy={verticalListSortingStrategy}>
              {table.getRowModel().rows.map((row) => (
                <DraggableRow key={row.id} row={row} />
              ))}
            </SortableContext>
          </TableBody>
        </Table>
      </DndContext>

      {/* Image preview dialog */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="sm:max-w-2xl p-2">
          <DialogTitle className="sr-only">{previewImage?.name ?? 'Image preview'}</DialogTitle>
          {previewImage && (
            <img
              src={`data:image/jpeg;base64,${previewImage.preview}`}
              alt={previewImage.name}
              className="w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Album form fields */}
      <div className="mt-6">
        <AlbumForm form={form} />
      </div>
    </div>
  );
};
