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
      // Every eslint-disable must say why, after a `--`, and name the rules it turns off.
      '@eslint-community/eslint-comments/require-description': 'error',
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      // Main-process IPC handlers must go through handle() and on() in src/main/ipc.ts, which
      // validate arguments with Zod. Tests that need ipcMain mock the whole module with
      // vi.mock('electron'), so they don't import it and need no exception.
      // The default import is banned too, since `electron.ipcMain` would slip past the rule.
      'no-restricted-imports': [
        'error',
        {
          paths: ['electron', 'electron/main'].map((name) => ({
            name,
            importNames: ['ipcMain', 'default'],
            message:
              'Use named imports from electron, and register IPC handlers with handle() or on() from src/main/ipc.ts.',
          })),
        },
      ],
      // no-restricted-imports only sees static imports, so close the require() and import()
      // routes to electron as well.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.name='require'][arguments.0.value=/^electron(\\/main)?$/]",
          message: 'Import electron with a static named import.',
        },
        {
          selector: 'ImportExpression[source.value=/^electron(\\/main)?$/]',
          message: 'Import electron with a static named import.',
        },
        {
          selector:
            'TSImportEqualsDeclaration[moduleReference.expression.value=/^electron(\\/main)?$/]',
          message: 'Import electron with a static named import.',
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
