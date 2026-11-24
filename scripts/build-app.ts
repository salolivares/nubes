/**
 * Builds the app into `.vite/` the same way `electron-forge package` does, without packaging.
 *
 * The e2e tests launch the unpackaged app (`electron .`), which loads `.vite/build/index.js`
 * from package.json's `main`. Packaging is slow and isn't needed for that, so this runs only
 * the Vite step of Forge's `prePackage` hook: it reads the Vite plugin's targets from
 * forge.config.cts and builds them in production mode.
 *
 * Run with `pnpm build`.
 */
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { VitePlugin } from '@electron-forge/plugin-vite';
import type ViteConfigGeneratorClass from '@electron-forge/plugin-vite/dist/ViteConfig.js';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { build, loadConfigFromFile } from 'vite';

// The plugin doesn't export its config generator. It's a CommonJS `exports.default`, which an
// ESM default import would wrap, so require it.
const require = createRequire(import.meta.url);
const { default: ViteConfigGenerator } =
  require('@electron-forge/plugin-vite/dist/ViteConfig.js') as {
    default: typeof ViteConfigGeneratorClass;
  };

const projectDir = path.resolve(import.meta.dirname, '..');

// Vite's config loader bundles TypeScript and CommonJS files, so it can read forge.config.cts.
const loaded = await loadConfigFromFile(
  { command: 'build', mode: 'production' },
  path.join(projectDir, 'forge.config.cts'),
  projectDir,
  'silent',
);
const forgeConfig = loaded?.config as ForgeConfig | undefined;
const vitePlugin = forgeConfig?.plugins?.find((plugin) => plugin instanceof VitePlugin);
if (!vitePlugin) throw new Error('forge.config.cts has no VitePlugin');

// Forge clears the output folder before a production build too.
await fs.rm(path.join(projectDir, '.vite'), { recursive: true, force: true });

const generator = new ViteConfigGenerator(vitePlugin.config, projectDir, true);
const configs = [...(await generator.getBuildConfigs()), ...(await generator.getRendererConfig())];

for (const config of configs) {
  await build({ configFile: false, logLevel: 'warn', ...config });
}

console.log(`Built ${configs.length} targets into .vite/`);
