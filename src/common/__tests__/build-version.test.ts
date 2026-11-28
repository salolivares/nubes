import { describe, expect, it } from 'vitest';

import { isReleaseVersion, versionFromDescribe } from '../build-version';

describe('versionFromDescribe', () => {
  it('uses the tag version on a release tag', () => {
    expect(versionFromDescribe('v1.2.0-0-gabc1234\n')).toBe('1.2.0');
  });

  it('adds the commits since the tag', () => {
    expect(versionFromDescribe('v1.2.0-3-gdef5678')).toBe('1.2.0+3');
  });

  it('keeps a pre-release suffix that contains dashes', () => {
    expect(versionFromDescribe('v0.1.0-alpha-92-g0e6fdb24')).toBe('0.1.0-alpha+92');
  });

  it('returns null for anything that is not a v version tag', () => {
    expect(versionFromDescribe('nightly-4-gabc1234')).toBeNull();
    expect(versionFromDescribe('abc1234')).toBeNull();
    expect(versionFromDescribe('')).toBeNull();
  });
});

describe('isReleaseVersion', () => {
  it('accepts major.minor.patch only', () => {
    expect(isReleaseVersion('1.2.0')).toBe(true);
    expect(isReleaseVersion('v1.2.0')).toBe(false);
    expect(isReleaseVersion('1.2')).toBe(false);
    expect(isReleaseVersion('1.2.0-beta')).toBe(false);
  });
});
