export interface DroppedFiles {
  /** Files main put on the `nubes-media://` allowlist, ready to queue by path. */
  entries: { path: string; name: string }[];
  /** Names of files that were not added, because they have no path on disk or main refused them. */
  missing: string[];
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
