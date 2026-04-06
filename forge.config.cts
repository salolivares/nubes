import fs from 'node:fs';
import path from 'node:path';

import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';

const nativeModules = [
  'better-sqlite3',
  'bindings',
  'file-uri-to-path',
  'sharp',
  '@img',
  'detect-libc',
  'semver',
];

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/*.{node,dll,dylib,so}',
    },
    extraResource: ['./src/common/db/migrations'],
  },
  rebuildConfig: {},
  hooks: {
    packageAfterCopy: async (_forgeConfig, buildPath) => {
      const srcModules = path.resolve(__dirname, 'node_modules');
      const destModules = path.join(buildPath, 'node_modules');

      for (const mod of nativeModules) {
        const src = path.join(srcModules, mod);
        if (!fs.existsSync(src)) continue;

        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
          // For scoped packages like @img, copy all sub-packages
          if (mod.startsWith('@')) {
            for (const sub of fs.readdirSync(src)) {
              const subSrc = path.join(src, sub);
              const subDest = path.join(destModules, mod, sub);
              fs.cpSync(subSrc, subDest, { recursive: true, dereference: true });
            }
          } else {
            const dest = path.join(destModules, mod);
            fs.cpSync(src, dest, { recursive: true, dereference: true });
          }
        }
      }
    },
  },
  makers: [new MakerSquirrel({}), new MakerZIP({}, ['darwin']), new MakerRpm({}), new MakerDeb({})],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
