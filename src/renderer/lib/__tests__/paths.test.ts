import { matchPath, matchRoutes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { routeTree } from '../../routes';
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

describe('routeTree', () => {
  // The leaf route each built path should land on, by its registered pattern.
  const cases: Array<[string, string]> = [
    [paths.home(), '/'],
    [paths.newUpload(), routePatterns.newUpload],
    [paths.photoset(3), routePatterns.photoset],
    ...WIZARD_STEPS.map((step): [string, string] => [
      paths.wizard[step](3),
      routePatterns.wizard[step],
    ]),
    [paths.settings.general(), routePatterns.settings.general],
    [paths.settings.cameras(), routePatterns.settings.cameras],
    [paths.settings.storage(), routePatterns.settings.storage],
  ];

  it.each(cases)('routes %s to %s', (url, pattern) => {
    const matches = matchRoutes(routeTree, url);
    expect(matches).not.toBeNull();
    const leaf = matches!.at(-1)!.route;
    // Index routes have no path of their own. Their parent holds the pattern.
    const matched = leaf.index ? matches!.at(-2)!.route.path : leaf.path;
    expect(matched).toBe(pattern);
  });
});
