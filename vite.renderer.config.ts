import react from '@vitejs/plugin-react';
import path from 'path';
import type { ConfigEnv, UserConfig } from 'vite';
import { defineConfig } from 'vite';

import { contentSecurityPolicy } from './src/common/csp';
import { pluginExposeRenderer } from './vite.base.config';

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
    plugins: [pluginExposeRenderer(name), react()],
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
      // The dev page's CSP. Packaged builds get the same policy (without the dev relaxations) from
      // the nubes://app handler. Both come from src/common/csp.ts.
      headers: { 'Content-Security-Policy': contentSecurityPolicy(true) },
      watch: {
        // Chromium caches and DevTools extensions under .dev-data churn constantly.
        ignored: ['**/.dev-data/**'],
      },
    },
    clearScreen: false,
  } as UserConfig;
});
