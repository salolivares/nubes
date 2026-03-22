import { FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';

export function DebugBar() {
  const [mockEnabled, setMockEnabled] = useState(true);

  useEffect(() => {
    window.debug?.isMockS3().then(setMockEnabled);
  }, []);

  const handleToggle = useCallback((checked: boolean) => {
    setMockEnabled(checked);
    window.debug?.setMockS3(checked);
  }, []);

  const handleOpenPath = useCallback(() => {
    window.debug?.openMockS3Path();
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
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={handleOpenPath}>
          <FolderOpen className="h-3 w-3" />
          Open mock folder
        </Button>
      )}
    </div>
  );
}
