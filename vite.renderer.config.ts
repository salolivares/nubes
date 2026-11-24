import react from '@vitejs/plugin-react';
import path from 'path';
import type { ConfigEnv, Plugin, UserConfig } from 'vite';
import { defineConfig } from 'vite';

import { pluginExposeRenderer } from './vite.base.config';

/**
 * The renderer's Content-Security-Policy. Replaces `__NUBES_CSP__` in index.html's meta tag.
 *
 * - `img-src` allows `nubes-media:` (photos served by main, see src/main/media/), `data:` (the base64
 *   previews saved in the DB) and `blob:` (dropped files before they have a path).
 * - `style-src 'unsafe-inline'`: sonner and Base UI insert <style> tags at runtime.
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
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

function pluginContentSecurityPolicy(): Plugin {
  let dev = false;
  return {
    name: 'nubes-csp',
    configResolved(config) {
      dev = config.command === 'serve';
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!html.includes('__NUBES_CSP__')) {
          throw new Error('index.html is missing the __NUBES_CSP__ placeholder');
        }
        return html.replace('__NUBES_CSP__', contentSecurityPolicy(dev));
      },
    },
  };
}

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv<'renderer'>;
  const { root, mode, forgeConfigSelf } = forgeEnv;
  const name = forgeConfigSelf.name ?? '';

  return {
    root,
    mode,
    base: './',
    build: {
      outDir: `.vite/renderer/${name}`,
    },
    plugins: [pluginContentSecurityPolicy(), pluginExposeRenderer(name), react()],
    resolve: {
      preserveSymlinks: true,
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@client': path.resolve(__dirname, './src/renderer'),
        '@common': path.resolve(__dirname, './src/common'),
        '@ui': path.resolve(__dirname, './src/renderer/components/ui'),
      },
    },
    server: {
      watch: {
        // Chromium caches and DevTools extensions under .dev-data churn constantly.
        ignored: ['**/.dev-data/**'],
      },
    },
    clearScreen: false,
  } as UserConfig;
});
