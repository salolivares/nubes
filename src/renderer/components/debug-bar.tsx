import { Copy, FolderOpen, Trash2 } from 'lucide-react';
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

  const handleCopyDbPath = useCallback(async () => {
    const dbPath = await window.debug?.getDbPath();
    if (dbPath) {
      await window.debug?.copyToClipboard(dbPath);
      toast.success('DB path copied to clipboard');
    }
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
    <div className="flex items-center gap-4 border-t bg-background px-4 py-2 text-xs">
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
        className="h-6 gap-1 px-2 text-xs"
        onClick={handleCopyDbPath}
      >
        <Copy className="h-3 w-3" />
        Copy DB path
      </Button>
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
