import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@client': path.resolve(__dirname, './src/renderer'),
      '@common': path.resolve(__dirname, './src/common'),
      '@ui': path.resolve(__dirname, './src/renderer/components/ui'),
    },
  },
  test: {
    include: ['src/renderer/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['src/renderer/test-setup.ts'],
  },
});
