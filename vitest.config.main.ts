import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@common': path.resolve(__dirname, './src/common'),
    },
  },
  test: {
    include: ['src/main/**/*.test.ts', 'src/common/**/*.test.ts'],
    environment: 'node',
    server: {
      deps: {
        external: [/electron/, /electron-store/, /electron-log/, /electron-squirrel-startup/],
      },
    },
  },
});
