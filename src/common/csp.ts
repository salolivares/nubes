/**
 * The renderer's Content-Security-Policy. Replaces `__NUBES_CSP__` in index.html's meta tag.
 *
 * - `img-src` allows `nubes-media:` (photos served by main, see src/main/media/), `data:` (the base64
 *   previews saved in the DB) and `blob:` (dropped files before they have a path).
 * - `style-src 'unsafe-inline'`: sonner and Base UI insert <style> tags at runtime.
 * - In the packaged app the page is a file:// URL, and Chromium lets `'self'` match every file:
 *   URL. Main blocks file:// requests outside the renderer folder (src/main/file-requests.ts).
 * - Dev only: Vite's dev server injects an inline script (React Refresh preamble) and inline
 *   <style> tags, and HMR talks over a websocket to the dev server. No 'unsafe-eval' in either.
 */
export function contentSecurityPolicy(dev: boolean): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", ...(dev ? ["'unsafe-inline'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'nubes-media:'],
    'connect-src': ["'self'", ...(dev ? ['ws://localhost:*', 'ws://127.0.0.1:*'] : [])],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
    'frame-src': ["'none'"],
    'worker-src': ["'none'"],
    'media-src': ["'none'"],
    'manifest-src': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}
