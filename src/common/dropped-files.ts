import type { DroppedFiles } from './types';

/**
 * Copies a drop's files into a new array, checking each one is a real File. The page calls
 * preload with whatever it likes, and contextBridge passes an object's methods through as
 * functions, so `{ map: () => [...] }` could otherwise hand preload made-up paths. A real File
 * can't be given a disk path by page code.
 */
export function toDroppedFileList(value: unknown): File[] {
  if (!Array.isArray(value)) throw new TypeError('Expected an array of dropped files');
  const files: File[] = [];
  for (let i = 0; i < value.length; i++) {
    const file: unknown = value[i];
    if (!(file instanceof File)) throw new TypeError('Expected an array of dropped files');
    files.push(file);
  }
  return files;
}

/**
 * Finds each dropped file on disk and asks main to allow it. Electron 32 removed `File.path`, and
 * react-dropzone fills it in with the bare file name, so `getPathForFile` (Electron's
 * `webUtils.getPathForFile`) is the only way to find a dropped file. It returns '' for files with
 * no disk copy, such as an image dragged out of a browser.
 */
export async function resolveDroppedFiles<F extends { name: string }>(
  files: F[],
  getPathForFile: (file: F) => string,
  allow: (paths: string[]) => Promise<string[]>,
): Promise<DroppedFiles> {
  const located = files.map((file) => ({ file, path: getPathForFile(file) }));
  const withPath = located.filter(({ path }) => path !== '');
  const allowed = new Set(withPath.length > 0 ? await allow(withPath.map(({ path }) => path)) : []);

  const entries: DroppedFiles['entries'] = [];
  const missing: string[] = [];
  for (const { file, path } of located) {
    if (allowed.has(path)) entries.push({ path, name: file.name });
    else missing.push(file.name);
  }
  return { entries, missing };
}
