/**
 * The packaged renderer is served from `nubes://app/` (see `src/main/app-protocol/`), so the CSP's
 * `'self'` is an origin that only covers the renderer bundle. Dev loads from the Vite dev server.
 */
export const APP_SCHEME = 'nubes';
export const APP_HOST = 'app';
export const APP_ENTRY_URL = `${APP_SCHEME}://${APP_HOST}/index.html`;
