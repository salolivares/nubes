import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import type { CameraSortMode } from '../hooks/useCameras';
import { useCameras } from '../hooks/useCameras';

export const CameraSettings = () => {
  const { cameras, rawCameras, sortMode, setSortMode, addCamera, removeCamera, reorderCameras } =
    useCameras();
  const [newName, setNewName] = useState('');

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await addCamera(trimmed);
    setNewName('');
  };

  const handleReorder = (index: number, direction: 'up' | 'down') => {
    const next = [...rawCameras];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorderCameras(next);
  };

  // For display, use sorted list in lastUsed mode, raw list in custom mode
  const displayCameras = sortMode === 'custom' ? rawCameras : cameras;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Label>Sort order</Label>
        <div className="flex gap-2">
          {(['lastUsed', 'custom'] as CameraSortMode[]).map((mode) => (
            <Button
              key={mode}
              variant={sortMode === mode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSortMode(mode)}
            >
              {mode === 'lastUsed' ? 'Last used' : 'Custom order'}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        <Label>Add camera</Label>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Fujifilm X-T5"
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={!newName.trim()}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </form>
      </div>

      <div className="grid gap-1">
        <Label>Cameras ({displayCameras.length})</Label>
        {displayCameras.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">
            No cameras saved yet. Add one above or select a new camera during upload.
          </p>
        )}
        {displayCameras.map((camera, index) => (
          <div
            key={camera.name}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <span className="flex-1 font-medium">{camera.name}</span>
            <span className="text-muted-foreground text-xs">{formatDate(camera.lastUsed)}</span>
            {sortMode === 'custom' && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={index === 0}
                  onClick={() => handleReorder(index, 'up')}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={index === displayCameras.length - 1}
                  onClick={() => handleReorder(index, 'down')}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => removeCamera(camera.name)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};
