import path from 'node:path';

import type { ConfigEnv, UserConfig } from 'vite';
import { defineConfig, mergeConfig } from 'vite';

import {
  esmodule,
  external,
  getBuildConfig,
  getBuildDefine,
  pluginHotRestart,
} from './vite.base.config';

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv<'build'>;
  const { forgeConfigSelf } = forgeEnv;
  const define = getBuildDefine(forgeEnv);
  const config: UserConfig = {
    build: {
      lib: {
        entry: {
          index: forgeConfigSelf.entry!,
          'image-processor': path.resolve(__dirname, 'src/main/drivers/image-processor.ts'),
        },
        fileName: (_, entryName) => `${entryName}.js`,
        formats: [esmodule ? 'es' : 'cjs'],
      },
      rollupOptions: {
        external,
        output: {
          entryFileNames: '[name].js',
        },
      },
    },
    plugins: [pluginHotRestart('restart')],
    define,
    resolve: {
      // Load the Node.js entry.
      mainFields: ['module', 'jsnext:main', 'jsnext'],
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@common': path.resolve(__dirname, './src/common'),
      },
    },
  };

  return mergeConfig(getBuildConfig(forgeEnv), config);
});
