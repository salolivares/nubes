/** A version `make release` accepts: plain `major.minor.patch`. */
export function isReleaseVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

/**
 * Turns `git describe --tags --long` output into the version the app reports. On a release tag,
 * `v1.2.0-0-gabc1234` gives `1.2.0`. Three commits later, `v1.2.0-3-gdef5678` gives `1.2.0+3`.
 * Returns null when the nearest tag isn't a `v` version tag.
 */
export function versionFromDescribe(describe: string): string | null {
  const match = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)-(\d+)-g[0-9a-f]+$/.exec(describe.trim());
  if (!match) return null;
  const [, tagVersion, commitsSince] = match;
  return commitsSince === '0' ? tagVersion : `${tagVersion}+${commitsSince}`;
}
