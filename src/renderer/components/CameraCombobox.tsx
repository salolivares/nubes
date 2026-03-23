import { cn } from '@client/lib/utils';
import { Camera, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { CameraEntry } from '../hooks/useCameras';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

interface CameraComboboxProps {
  value: string;
  cameras: CameraEntry[];
  onSelect: (name: string) => void;
  onAdd: (name: string) => void;
}

export function CameraCombobox({ value, cameras, onSelect, onAdd }: CameraComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query
    ? cameras.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : cameras;

  const exactMatch = cameras.some((c) => c.name.toLowerCase() === query.toLowerCase());
  const showAddOption = query.trim() && !exactMatch;

  // total items = filtered + optional "add" row
  const totalItems = filtered.length + (showAddOption ? 1 : 0);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      // Focus the input after popover opens
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const handleSelect = (name: string) => {
    onSelect(name);
    setOpen(false);
  };

  const handleAdd = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    onSelect(trimmed);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, totalItems - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex < filtered.length) {
        handleSelect(filtered[highlightIndex].name);
      } else if (showAddOption) {
        handleAdd();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[highlightIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-sm',
            'border-transparent bg-transparent shadow-none hover:border-input focus:border-input focus:bg-background',
            'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            !value && 'text-muted-foreground'
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {value ? (
              value
            ) : (
              <>
                <Camera className="h-4 w-4" />
                Select camera
              </>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="p-2">
          <Input
            ref={inputRef}
            placeholder="Search or add camera..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 text-sm"
          />
        </div>
        <div ref={listRef} className="max-h-48 overflow-y-auto">
          {filtered.map((camera, i) => (
            <button
              key={camera.name}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                highlightIndex === i && 'bg-accent text-accent-foreground',
                'hover:bg-accent hover:text-accent-foreground'
              )}
              onMouseEnter={() => setHighlightIndex(i)}
              onClick={() => handleSelect(camera.name)}
            >
              <Check
                className={cn('h-4 w-4', camera.name === value ? 'opacity-100' : 'opacity-0')}
              />
              {camera.name}
            </button>
          ))}
          {showAddOption && (
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground',
                highlightIndex === filtered.length && 'bg-accent text-accent-foreground',
                'hover:bg-accent hover:text-accent-foreground'
              )}
              onMouseEnter={() => setHighlightIndex(filtered.length)}
              onClick={handleAdd}
            >
              <Plus className="h-4 w-4" />
              Add &quot;{query.trim()}&quot;
            </button>
          )}
          {filtered.length === 0 && !showAddOption && (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No cameras saved. Type to add one.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
