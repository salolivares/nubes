import { useCallback, useMemo, useState } from 'react';

import type { PhotoNameInput } from '@/common/photo-names';
import { photoNameErrors } from '@/common/photo-names';

/**
 * Blocks upload until every photo has a real name. A photo's error shows once its name was edited,
 * or for every photo after an upload attempt. `photos` must be memoized by the caller.
 */
export function usePhotoNameCheck(photos: readonly PhotoNameInput[]) {
  const errors = useMemo(() => photoNameErrors(photos), [photos]);
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());

  const markTouched = useCallback((id: string) => {
    setTouched((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const visibleErrors = useMemo(() => {
    const visible = new Map<string, string>();
    for (const [id, error] of errors) {
      if (attempted || touched.has(id)) visible.set(id, error);
    }
    return visible;
  }, [errors, attempted, touched]);

  /**
   * True when upload can go ahead. Otherwise shows every error and moves focus to the first
   * unnamed photo. Focus waits a tick, because closing the upload menu hands focus back to its
   * trigger.
   */
  const checkBeforeUpload = useCallback((): boolean => {
    const firstId = errors.keys().next().value;
    if (firstId === undefined) return true;
    setAttempted(true);
    setTimeout(() => {
      const input = [...document.querySelectorAll<HTMLInputElement>('[data-photo-name-id]')].find(
        (el) => el.dataset.photoNameId === firstId,
      );
      input?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      input?.focus({ preventScroll: true });
    }, 0);
    return false;
  }, [errors]);

  return {
    unnamedCount: errors.size,
    attempted,
    visibleErrors,
    markTouched,
    checkBeforeUpload,
  };
}
