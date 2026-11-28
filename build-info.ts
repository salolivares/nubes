/**
 * The version and commit a build reports, read from git. Forge puts the version in the app's
 * Info.plist, and Vite stamps both into main for the About panel and the startup log.
 */
import { execFileSync } from 'node:child_process';

import pkg from './package.json';
import { versionFromDescribe } from './src/common/build-version';

export interface BuildInfo {
  /** `1.2.0` on a release tag, `1.2.0+3` three commits after it, package.json's with no tag. */
  version: string;
  /** Short hash, with `-dirty` when the tree has uncommitted changes. Null outside git. */
  commit: string | null;
}

function git(...args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

export function buildInfo(): BuildInfo {
  const describe = git('describe', '--tags', '--long', '--match', 'v[0-9]*');
  const hash = git('rev-parse', '--short', 'HEAD');
  const dirty = hash !== null && git('status', '--porcelain') !== '';
  return {
    version: (describe && versionFromDescribe(describe)) ?? pkg.version,
    commit: hash && (dirty ? `${hash}-dirty` : hash),
  };
}
