import path from 'node:path';

import type { ConfigEnv, Plugin, UserConfig } from 'vite';
import { defineConfig, mergeConfig } from 'vite';

import { external, getBuildConfig, pluginHotRestart } from './vite.base.config';

/** The only module a sandboxed preload may require. Electron offers a few more, but we don't use them. */
const SANDBOX_ALLOWED_REQUIRES = new Set(['electron']);

/**
 * Fails the build unless the preload comes out as one CommonJS file that requires only `electron`.
 * A sandboxed preload can't load a second file, ESM, or Node built-ins, and if it breaks the
 * renderer just loses its `window.*` APIs at runtime. Failing here keeps that from slipping by.
 */
export function pluginSandboxedPreload(): Plugin {
  return {
    name: 'nubes:sandboxed-preload',
    generateBundle(options, bundle) {
      if (options.format !== 'cjs') {
        this.error(`The preload must build as CommonJS for the sandbox, got "${options.format}".`);
      }

      const chunks = Object.values(bundle).filter((file) => file.type === 'chunk');
      if (chunks.length !== 1) {
        this.error(
          `The preload must be a single file for the sandbox, got ${chunks.length}: ` +
            chunks.map((chunk) => chunk.fileName).join(', '),
        );
      }

      for (const chunk of chunks) {
        const required = new Set([
          ...chunk.imports,
          ...chunk.dynamicImports,
          // Catches requires that bundled CommonJS code makes itself, including non-literal ones.
          ...Array.from(chunk.code.matchAll(/\brequire\(\s*([^)]*?)\s*\)/g), (m) =>
            m[1].replace(/^(["'`])(.*)\1$/, '$2'),
          ),
        ]);
        const disallowed = [...required].filter((id) => !SANDBOX_ALLOWED_REQUIRES.has(id));
        if (disallowed.length > 0) {
          this.error(
            `The sandboxed preload ${chunk.fileName} may only require "electron", but requires: ` +
              `${disallowed.join(', ')}. Keep Node built-ins and Node-only packages out of src/preload.`,
          );
        }
      }
    },
  };
}

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv<'build'>;
  const { forgeConfigSelf } = forgeEnv;
  const config: UserConfig = {
    build: {
      rollupOptions: {
        external,
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: forgeConfigSelf.entry!,
        output: {
          // A sandboxed preload runs as one CommonJS script that can only require `electron`
          // (and a few other modules). It can't load ESM or other files, so the whole preload
          // goes into a single `.cjs` file. The `.cjs` extension matters because package.json
          // sets `"type": "module"`. pluginSandboxedPreload() checks the output.
          format: 'cjs',
          inlineDynamicImports: true,
          entryFileNames: '[name].cjs',
          chunkFileNames: '[name].cjs',
          assetFileNames: '[name].[ext]',
        },
      },
    },
    plugins: [pluginSandboxedPreload(), pluginHotRestart('reload')],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@client': path.resolve(__dirname, './src/renderer'),
        '@common': path.resolve(__dirname, './src/common'),
        '@ui': path.resolve(__dirname, './src/renderer/components/ui'),
      },
    },
  };

  return mergeConfig(getBuildConfig(forgeEnv), config);
});
