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
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Row, Table as TTable } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import { GripVertical } from 'lucide-react';
import { createContext, type CSSProperties, useContext } from 'react';

import { cn } from '../lib/utils';
import { Table, TableBody, TableHead, TableHeader, TableRow } from './ui/table';

// ── Sortable row context ──────────────────────────────────────────────

type SortableRowCtx = {
  attributes: ReturnType<typeof useSortable>['attributes'];
  listeners: ReturnType<typeof useSortable>['listeners'];
};

const SortableRowContext = createContext<SortableRowCtx | null>(null);

// ── Drag handle cell ──────────────────────────────────────────────────

export function RowDragHandleCell() {
  const ctx = useContext(SortableRowContext);
  if (!ctx) return null;
  return (
    <button type="button" className="cursor-grab touch-none" {...ctx.attributes} {...ctx.listeners}>
      <GripVertical className="text-muted-foreground" />
    </button>
  );
}

// ── Draggable row ─────────────────────────────────────────────────────

export function DraggableRow<T>({ row }: { row: Row<T> }) {
  const { transform, transition, setNodeRef, isDragging, attributes, listeners } = useSortable({
    id: row.id,
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

// ── Sortable table ────────────────────────────────────────────────────

export function SortableTable<T>({
  table,
  dataIds,
  onDragEnd,
}: {
  table: TTable<T>;
  dataIds: string[];
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {}),
  );

  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      sensors={sensors}
      onDragEnd={onDragEnd}
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
  );
}
