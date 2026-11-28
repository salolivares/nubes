import { z } from 'zod';

/**
 * Processing names each photo after its source file, minus the extension, and writes its outputs
 * as `<stem>_<resolution>.<type>` (`src/main/drivers/image-worker/process-image.ts`). The stem is
 * the name, or `name-2`, `name-3` and so on when another photo in the photoset already took it.
 */
const OUTPUT_FILE = /^(.+)_\d+\.[a-z0-9]+$/is;
const DEDUPE_SUFFIX = /^(.+)-\d+$/s;

/**
 * The names processing could have given a photo, read back from its output paths. Empty when the
 * paths don't look like processing outputs, so an unknown layout never flags a real name.
 */
export function defaultPhotoNames(outputPaths: readonly string[]): string[] {
  const names = new Set<string>();
  for (const outputPath of outputPaths) {
    // macOS paths: only `/` separates. A file name can contain `\` or a newline.
    const file = outputPath.split('/').pop() ?? '';
    // Trimmed like the name it's compared with, so ` IMG_0042 .jpg` still counts as default.
    const stem = OUTPUT_FILE.exec(file)?.[1]?.trim();
    if (!stem) continue;
    names.add(stem);
    // Ambiguous: `Pier-2` may be a source called that, or a second `Pier`. Both count as default.
    const deduped = DEDUPE_SUFFIX.exec(stem)?.[1]?.trim();
    if (deduped) names.add(deduped);
  }
  return [...names];
}

/**
 * True when `name` is still the file name processing gave the photo. Ignores surrounding spaces
 * only: changing the case (`sunset` to `Sunset`) counts as naming it.
 */
export function isDefaultPhotoName(name: string, outputPaths: readonly string[]): boolean {
  return defaultPhotoNames(outputPaths).includes(name.trim());
}

export const PHOTO_NAME_REQUIRED = 'Give this photo a name';
export const PHOTO_NAME_IS_FILENAME = 'Still the file name. Give this photo a real name';

/** A photo's name must be filled in and must not be the file name it started with. */
export function photoNameSchema(outputPaths: readonly string[]) {
  return z
    .string()
    .trim()
    .min(1, PHOTO_NAME_REQUIRED)
    .refine((name) => !isDefaultPhotoName(name, outputPaths), PHOTO_NAME_IS_FILENAME);
}

/** Why a photo can't be uploaded with this name, or undefined when the name is fine. */
export function photoNameError(name: string, outputPaths: readonly string[]): string | undefined {
  const result = photoNameSchema(outputPaths).safeParse(name);
  return result.success ? undefined : result.error.issues[0]?.message;
}

export interface PhotoNameInput {
  id: string;
  name: string;
  outputPaths: readonly string[];
}

/** Errors keyed by photo id, in photo order. Empty when every photo has a real name. */
export function photoNameErrors(photos: readonly PhotoNameInput[]): Map<string, string> {
  const errors = new Map<string, string>();
  for (const photo of photos) {
    const error = photoNameError(photo.name, photo.outputPaths);
    if (error) errors.set(photo.id, error);
  }
  return errors;
}
