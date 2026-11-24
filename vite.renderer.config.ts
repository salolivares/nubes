import react from '@vitejs/plugin-react';
import path from 'path';
import type { ConfigEnv, Plugin, UserConfig } from 'vite';
import { defineConfig } from 'vite';

import { contentSecurityPolicy } from './src/common/csp';
import { pluginExposeRenderer } from './vite.base.config';

/** Fills the `__NUBES_CSP__` placeholder in index.html. The policy is in src/common/csp.ts. */
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
