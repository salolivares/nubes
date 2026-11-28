/**
 * The version main was built as: `1.2.0` on a release tag, `1.2.0+3` three commits after it.
 * Set by `define` in `vite.main.config.ts` from `build-info.ts`, so it only exists in main.
 */
declare const NUBES_BUILD_VERSION: string;

/**
 * The commit main was built from, like `abc1234` or `abc1234-dirty`. Null when the build ran
 * outside a git checkout. Set the same way, so it only exists in main.
 */
declare const NUBES_BUILD_COMMIT: string | null;
