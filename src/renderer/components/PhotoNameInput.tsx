import { useId } from 'react';

import { Input } from './ui/input';

/** The editable name cell in the review tables. Commits on blur or Enter. */
export function PhotoNameInput({
  photoId,
  defaultValue,
  error,
  onCommit,
}: {
  photoId: string;
  defaultValue: string;
  error?: string;
  onCommit: (name: string) => void;
}) {
  // Not from photoId: ids carry the file name, which can contain spaces.
  const errorId = useId();
  return (
    <div className="space-y-1">
      <Input
        type="text"
        aria-label="Photo name"
        data-photo-name-id={photoId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        defaultValue={defaultValue}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onCommit(e.currentTarget.value);
            e.currentTarget.blur();
          }
        }}
        className="border-transparent bg-transparent shadow-none hover:border-input focus:border-input focus:bg-background"
      />
      {error && (
        <p id={errorId} className="px-2.5 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** "2 photos need a name", shown next to the upload button. */
export function UnnamedPhotosNotice({ count, emphasize }: { count: number; emphasize: boolean }) {
  if (count === 0) return null;
  return (
    <p
      role="status"
      className={emphasize ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
    >
      {count === 1 ? '1 photo needs a name' : `${count} photos need a name`} before upload
    </p>
  );
}
