/**
 * The commit main was built from, like `abc1234` or `abc1234-dirty`. Null when the build ran
 * outside a git checkout. Set by `define` in `vite.main.config.ts`, so it only exists in main.
 */
declare const NUBES_BUILD_COMMIT: string | null;
