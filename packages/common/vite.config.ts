import { node } from '../../.electron-vendors.cache.json';
import { join } from 'node:path';

const PACKAGE_ROOT = __dirname;
const PROJECT_ROOT = join(PACKAGE_ROOT, '../..');

const config = {
  mode: process.env.MODE,
  root: PACKAGE_ROOT,
  envDir: PROJECT_ROOT,
  resolve: {
    alias: {
      '/@common/': join(PACKAGE_ROOT, 'src') + '/',
    },
  },
  build: {
    ssr: true,
    sourcemap: 'inline',
    target: `node${node}`,
    outDir: 'dist',
    assetsDir: '.',
    minify: process.env.MODE !== 'development',
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
      },
    },
    emptyOutDir: true,
    reportCompressedSize: false,
  },
};

export default config;
