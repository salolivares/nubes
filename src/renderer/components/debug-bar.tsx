import { FolderOpen, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';

export function DebugBar() {
  const [mockEnabled, setMockEnabled] = useState(true);

  useEffect(() => {
    window.debug?.isMockS3().then(setMockEnabled);
  }, []);

  const handleToggle = useCallback(async (checked: boolean) => {
    setMockEnabled(checked);
    await window.debug?.setMockS3(checked);
    window.location.reload();
  }, []);

  const handleOpenPath = useCallback(() => {
    window.debug?.openMockS3Path();
  }, []);

  const handleClearDb = useCallback(async () => {
    await window.debug?.clearDb();
    toast.success('Database cleared');
    window.location.reload();
  }, []);

  if (process.env.NODE_ENV !== 'development' || !window.debug) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-4 border-t bg-background/80 px-4 py-2 text-xs backdrop-blur-xs">
      <span className="font-semibold text-muted-foreground">Debug</span>
      <div className="flex items-center gap-2">
        <Checkbox
          id="mock-s3"
          checked={mockEnabled}
          onCheckedChange={(checked) => handleToggle(checked === true)}
        />
        <Label htmlFor="mock-s3" className="cursor-pointer text-xs">
          Mock S3
        </Label>
      </div>
      {mockEnabled && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-xs"
          onClick={handleOpenPath}
        >
          <FolderOpen className="h-3 w-3" />
          Open mock folder
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 gap-1 px-2 text-xs text-destructive hover:text-destructive"
        onClick={handleClearDb}
      >
        <Trash2 className="h-3 w-3" />
        Clear DB
      </Button>
    </div>
  );
}
