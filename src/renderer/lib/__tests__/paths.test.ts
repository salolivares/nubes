import { matchPath } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { paths, routePatterns, WIZARD_STEPS, wizardPath } from '../paths';

describe('paths', () => {
  it('builds every route', () => {
    expect(paths.home()).toBe('/');
    expect(paths.newUpload()).toBe('/new');
    expect(paths.photoset(7)).toBe('/photoset/7');
    expect(paths.wizard.picker(7)).toBe('/photoset/7/picker');
    expect(paths.wizard.upload(7)).toBe('/photoset/7/upload');
    expect(paths.wizard.s3(7)).toBe('/photoset/7/s3');
    expect(paths.wizard.summary(7)).toBe('/photoset/7/summary');
    expect(paths.settings.general()).toBe('/settings');
    expect(paths.settings.cameras()).toBe('/settings/cameras');
    expect(paths.settings.storage()).toBe('/settings/storage');
  });

  it.each(WIZARD_STEPS)('wizardPath(%s) matches paths.wizard', (step) => {
    expect(wizardPath(12, step)).toBe(paths.wizard[step](12));
  });

  it('builds paths that match their own route pattern', () => {
    expect(matchPath(routePatterns.photoset, paths.photoset(3))?.params).toEqual({
      photosetId: '3',
    });
    for (const step of WIZARD_STEPS) {
      expect(matchPath(routePatterns.wizard[step], paths.wizard[step](3))?.params).toEqual({
        photosetId: '3',
      });
    }
    for (const key of ['general', 'cameras', 'storage'] as const) {
      expect(matchPath(routePatterns.settings[key], paths.settings[key]())).not.toBeNull();
    }
  });

  it('does not match a wizard path to the photoset detail route', () => {
    expect(matchPath(routePatterns.photoset, paths.wizard.picker(3))).toBeNull();
  });
});
