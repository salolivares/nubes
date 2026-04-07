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
import {
  ArrowLeft,
  ChevronDown,
  GripVertical,
  ImageIcon,
  ImagePlus,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  createContext,
  type CSSProperties,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import type { Album, InProgressEvent, ProcessedImage } from '@/common/types';
import { albumSchema } from '@/common/types';

import { AlbumForm } from '../../components/AlbumForm/AlbumForm';
import { CameraCombobox } from '../../components/CameraCombobox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { Button } from '../../components/ui/button';
import { ButtonGroup } from '../../components/ui/button-group';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Input } from '../../components/ui/input';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { useCameras } from '../../hooks/useCameras';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';
import type { DbImage, PhotosetWithImages } from './utils';
import { toProcessedImages } from './utils';

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

function DraggableRow({ row }: { row: Row<DbImage> }) {
  const { transform, transition, setNodeRef, isDragging, attributes, listeners } = useSortable({
    id: String(row.original.id),
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

// ── Helpers ──────────────────────────────────────────────────────────

/** Counter for generating temporary negative IDs for newly processed images. */
let nextTempId = -1;

function processedImageToDbImage(img: ProcessedImage, sortOrder: number): DbImage {
  const tempId = nextTempId--;
  return {
    id: tempId,
    photosetId: 0, // placeholder, not used for save
    name: img.name,
    camera: img.camera ?? null,
    originalPath: img.imagePaths[0]?.imagePath ?? '',
    preview: img.preview ?? null,
    sortOrder,
    createdAt: new Date().toISOString(),
    outputs: img.imagePaths.map((p, i) => ({
      id: nextTempId - i, // unique negative IDs
      imageId: tempId,
      imagePath: p.imagePath,
      type: p.type,
      resolution: p.resolution,
      byteLength: p.byteLength,
    })),
  };
}

export function DraftView({
  photoset,
  onUpdate,
}: {
  photoset: PhotosetWithImages;
  onUpdate: () => void;
}) {
  const navigate = useNavigate();
  const { cameras, addCamera, touchCamera } = useCameras();
  const [images, setImages] = useState(photoset.images);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [processingTotal, setProcessingTotal] = useState(0);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const form = useForm<Album>({
    resolver: zodResolver(albumSchema),
    mode: 'onChange',
    defaultValues: {
      name: photoset.name,
      location: photoset.location ?? '',
      year: photoset.year ?? new Date().getFullYear(),
      published: photoset.status === 'published',
    },
  });

  const { mutate: uploadMutate, isLoading: isUploading } = trpc.bucket.createAlbum.useMutation({
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const hasOutputs = images.some((img) => img.outputs.length > 0);

  const [imagesDirty, setImagesDirty] = useState(false);
  const [previewImage, setPreviewImage] = useState<DbImage | null>(null);

  // Clean up event listeners on unmount
  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
    };
  }, []);

  const handleAddImages = async () => {
    const files = await window.imagePicker.open();
    if (files.length === 0) return;

    const paths = files.map((f) => f.path);
    setIsProcessing(true);
    setProcessedCount(0);
    setProcessingTotal(paths.length);

    // Clean up any previous listeners
    unsubscribeRef.current?.();

    const unsubProgress = window.imageProcessor.onProgressChange(
      (_: unknown, event: InProgressEvent) => {
        setProcessedCount((prev) => Math.min(prev + 1, event.total));
      },
    );

    const unsubComplete = window.imageProcessor.onComplete(
      (_: unknown, result: { processedImages: ProcessedImage[] }) => {
        const newImages = result.processedImages;
        setImages((prev) => {
          const startOrder = prev.length;
          const converted = newImages.map((img, i) => processedImageToDbImage(img, startOrder + i));
          return [...prev, ...converted];
        });
        setImagesDirty(true);
        setIsProcessing(false);
        toast.success(`Added ${newImages.length} image${newImages.length === 1 ? '' : 's'}`);

        // Clean up listeners
        unsubProgress();
        unsubComplete();
        unsubscribeRef.current = null;
      },
    );

    unsubscribeRef.current = () => {
      unsubProgress();
      unsubComplete();
    };

    window.imageProcessor.resize({ imagePaths: paths });
  };

  const handleImageUpdate = (
    imageId: number,
    updates: Partial<Pick<DbImage, 'name' | 'camera'>>,
  ) => {
    setImages((prev) => prev.map((img) => (img.id === imageId ? { ...img, ...updates } : img)));
    setImagesDirty(true);
  };

  const handleCameraSelect = (imageId: number, cameraName: string) => {
    handleImageUpdate(imageId, { camera: cameraName });
    touchCamera(cameraName);
  };

  // ── Column definitions ───────────────────────────────────────────

  const columns = useMemo<ColumnDef<DbImage>[]>(
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
            onBlur={(e) => handleImageUpdate(row.original.id, { name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleImageUpdate(row.original.id, { name: (e.target as HTMLInputElement).value });
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
            onAdd={async (name) => addCamera(name)}
          />
        ),
      },
    ],
    [cameras, addCamera, handleCameraSelect, handleImageUpdate],
  );

  // ── TanStack Table ───────────────────────────────────────────────

  const table = useReactTable({
    data: images,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  });

  const dataIds = useMemo(() => images.map((img) => String(img.id)), [images]);

  // ── DnD sensors ──────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {}),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = dataIds.indexOf(String(active.id));
      const newIndex = dataIds.indexOf(String(over.id));
      setImages((prev) => arrayMove(prev, oldIndex, newIndex));
      setImagesDirty(true);
    }
  };

  // ── Submit handlers ──────────────────────────────────────────────

  const handleSave = form.handleSubmit(async (values) => {
    setIsSaving(true);
    try {
      await window.photosets.update({
        id: photoset.id,
        name: values.name,
        location: values.location,
        year: values.year,
        status: values.published ? 'published' : 'draft',
      });
      if (imagesDirty) {
        await window.photosets.addImages({
          photosetId: photoset.id,
          images: images.map((img, i) => ({
            name: img.name,
            camera: img.camera ?? undefined,
            originalPath: img.originalPath,
            preview: img.preview ?? undefined,
            sortOrder: i,
            outputs: img.outputs.map((o) => ({
              imagePath: o.imagePath,
              type: o.type,
              resolution: o.resolution,
              byteLength: o.byteLength,
            })),
          })),
        });
        setImagesDirty(false);
      }
      toast.success('Draft saved');
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  });

  const handleUpload = form.handleSubmit((values) => {
    const processedImages = toProcessedImages(images);

    uploadMutate(
      { bucketName: photoset.bucketName, album: values, images: processedImages },
      {
        onSuccess: async () => {
          try {
            await window.photosets.update({
              id: photoset.id,
              name: values.name,
              location: values.location,
              year: values.year,
            });
            if (imagesDirty) {
              await window.photosets.addImages({
                photosetId: photoset.id,
                images: images.map((img, i) => ({
                  name: img.name,
                  camera: img.camera ?? undefined,
                  originalPath: img.originalPath,
                  preview: img.preview ?? undefined,
                  sortOrder: i,
                  outputs: img.outputs.map((o) => ({
                    imagePath: o.imagePath,
                    type: o.type,
                    resolution: o.resolution,
                    byteLength: o.byteLength,
                  })),
                })),
              });
            }
            await window.photosets.markUploaded({ id: photoset.id });
            if (values.published) {
              await window.photosets.publish({ id: photoset.id });
            }
          } catch {
            // Non-fatal
          }
          toast.success('Album uploaded to S3');
          onUpdate();
        },
      },
    );
  });

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await window.photosets.delete({ id: photoset.id });
      toast.success('Photoset deleted');
      navigate('/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
      setIsDeleting(false);
    }
  };

  const busy = isSaving || isUploading || isDeleting || isProcessing;
  const { isDirty, isValid } = form.formState;
  const canSubmit = (isDirty || imagesDirty) && isValid && !busy;
  const canUpload = isValid && !busy && hasOutputs;

  return (
    <div className="space-y-6 p-6 md:p-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{photoset.name}</h1>
            <p className="text-sm text-muted-foreground">Draft &middot; {photoset.bucketName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={busy} onClick={handleAddImages}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing {processedCount}/{processingTotal}
              </>
            ) : (
              <>
                <ImagePlus className="h-4 w-4" />
                Add Images
              </>
            )}
          </Button>
          <ButtonGroup>
            <Button disabled={!canSubmit} onClick={handleSave}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Draft
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button disabled={!canSubmit && !canUpload} className="px-2!" />}
              >
                <ChevronDown />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuItem disabled={!canUpload} onClick={handleUpload}>
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload />}
                    Upload to S3
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={busy}
                    onClick={() => {
                      setTimeout(() => setShowDeleteDialog(true), 0);
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 />
                    Delete Photoset
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete photoset?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete &ldquo;{photoset.name}&rdquo; and all its images from
                  the local database. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {!hasOutputs && images.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          No processed image outputs found. You can still edit metadata and save, but uploading to
          S3 is disabled. Re-process the images to enable upload.
        </div>
      )}

      {/* Mass-apply camera toolbar */}
      {images.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Apply to all:</span>
          <div className="w-56">
            <CameraCombobox
              value=""
              cameras={cameras}
              onSelect={(name) => {
                setImages((prev) => prev.map((img) => ({ ...img, camera: name })));
                touchCamera(name);
                setImagesDirty(true);
              }}
              onAdd={async (name) => addCamera(name)}
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
          {previewImage?.preview && (
            <img
              src={`data:image/jpeg;base64,${previewImage.preview}`}
              alt={previewImage.name}
              className="w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Album form fields */}
      <AlbumForm form={form} />
    </div>
  );
}
