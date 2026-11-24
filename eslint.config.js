import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import importX from 'eslint-plugin-import-x';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      'node_modules/**',
      '**/dist/**',
      '.vite/**',
      'out/**',
      '*.config.js',
      '.*.cjs',
      '.dev-data/**',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@eslint-community/eslint-comments': eslintComments,
      'import-x': importX,
      'simple-import-sort': simpleImportSort,
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'import-x/first': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/no-duplicates': 'error',
      // Every eslint-disable must say why, after a `--`.
      '@eslint-community/eslint-comments/require-description': 'error',
      // Main-process IPC handlers must go through handle() and on() in src/main/ipc.ts, which
      // validate arguments with Zod. Tests that need ipcMain mock the whole module with
      // vi.mock('electron'), so they don't import it and need no exception.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              importNames: ['ipcMain'],
              message: 'Register IPC handlers with handle() or on() from src/main/ipc.ts.',
            },
          ],
        },
      ],
    },
  },
  {
    // The one place allowed to touch ipcMain: it wraps it with Zod validation.
    files: ['src/main/ipc.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  eslintConfigPrettier,
);
