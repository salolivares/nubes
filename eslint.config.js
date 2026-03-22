import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import importX from "eslint-plugin-import-x";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["node_modules/**", "**/dist/**", ".vite/**", "out/**", "*.config.js", ".*.cjs"] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "import-x": importX,
      "simple-import-sort": simpleImportSort,
    },
    settings: {
      "import-x/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/consistent-type-imports": "error",
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "import-x/first": "error",
      "import-x/newline-after-import": "error",
      "import-x/no-duplicates": "error",
    },
  },
  eslintConfigPrettier,
);
