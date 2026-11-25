import path from 'node:path';

import type { ConfigEnv, Plugin, UserConfig } from 'vite';
import { defineConfig, mergeConfig } from 'vite';

import { external, getBuildConfig, pluginHotRestart } from './vite.base.config';

/** The only module a sandboxed preload may require. Electron offers a few more, but we don't use them. */
const SANDBOX_ALLOWED_REQUIRE = 'electron';

type AstNode = { type: string; start: number; end: number; [key: string]: unknown };

const isAstNode = (value: unknown): value is AstNode =>
  typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string';

/**
 * Lists every way the code loads a module other than `require('electron')`: any other require call,
 * `require` used as a value (an alias would hide the call), and any `import()`, which a sandboxed
 * preload can't run. Works on Rollup's AST, so `require(` inside a string doesn't count.
 */
export function findDisallowedLoads(ast: AstNode, code: string): string[] {
  const found: string[] = [];
  const source = (node: AstNode) => code.slice(node.start, node.end);

  const walk = (node: AstNode) => {
    if (node.type === 'ImportExpression') {
      found.push(source(node));
    } else if (
      node.type === 'CallExpression' &&
      isAstNode(node.callee) &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'require'
    ) {
      const args = node.arguments as AstNode[];
      const allowed =
        args.length === 1 &&
        args[0].type === 'Literal' &&
        args[0].value === SANDBOX_ALLOWED_REQUIRE;
      if (!allowed) found.push(source(node));
      args.forEach(walk);
      return;
    } else if (node.type === 'Identifier' && node.name === 'require') {
      found.push(`require used as a value at offset ${node.start}`);
    }

    for (const [key, value] of Object.entries(node)) {
      // `obj.require` and `{ require: x }` name a property, not the require function.
      if (key === 'property' && node.type === 'MemberExpression' && !node.computed) continue;
      if (key === 'key' && !node.computed) continue;
      for (const child of Array.isArray(value) ? value : [value]) {
        if (isAstNode(child)) walk(child);
      }
    }
  };

  walk(ast);
  return found;
}

/**
 * Fails the build unless the preload comes out as one CommonJS file, `preload.cjs`, that requires
 * only `electron`. A sandboxed preload can't load a second file, ESM, or Node built-ins, and if it
 * breaks, the renderer just loses its `window.*` APIs at runtime. Failing here keeps that from
 * slipping by. In `pnpm start` the error stops the preload build, and saving a fix resumes it.
 */
export function pluginSandboxedPreload(): Plugin {
  return {
    name: 'nubes:sandboxed-preload',
    generateBundle(options, bundle) {
      if (options.format !== 'cjs') {
        this.error(`The preload must build as CommonJS for the sandbox, got "${options.format}".`);
      }

      const chunks = Object.values(bundle).filter((file) => file.type === 'chunk');
      if (chunks.length !== 1 || chunks[0].fileName !== 'preload.cjs') {
        this.error(
          'The preload must be a single file named preload.cjs, which src/main/mainWindow.ts loads. ' +
            `Got: ${chunks.map((chunk) => chunk.fileName).join(', ') || 'nothing'}`,
        );
      }

      const [chunk] = chunks;
      const external = [...chunk.imports, ...chunk.dynamicImports].filter(
        (id) => id !== SANDBOX_ALLOWED_REQUIRE,
      );
      const loads = findDisallowedLoads(this.parse(chunk.code) as unknown as AstNode, chunk.code);
      const disallowed = [...new Set([...external, ...loads])];
      if (disallowed.length > 0) {
        this.error(
          `The sandboxed preload ${chunk.fileName} may only require "electron", but loads: ` +
            `${disallowed.join(', ')}. Keep Node built-ins and Node-only packages out of src/preload.`,
        );
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
