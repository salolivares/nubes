import { generatePath } from 'react-router-dom';

/** Wizard steps, in order. Each is a route under `/photoset/:photosetId/`. */
export const WIZARD_STEPS = ['picker', 'upload', 's3', 'summary'] as const;
export type WizardStepName = (typeof WIZARD_STEPS)[number];

const PHOTOSET = '/photoset/:photosetId';
const SETTINGS = '/settings';

const wizardPattern = <S extends WizardStepName>(step: S) => `${PHOTOSET}/${step}` as const;

/**
 * Route patterns. `routes.tsx` registers these, and `paths` below builds URLs from them, so the two
 * can't drift.
 */
export const routePatterns = {
  home: '/',
  newUpload: '/new',
  photoset: PHOTOSET,
  wizard: {
    picker: wizardPattern('picker'),
    upload: wizardPattern('upload'),
    s3: wizardPattern('s3'),
    summary: wizardPattern('summary'),
  },
  settings: {
    general: SETTINGS,
    cameras: `${SETTINGS}/cameras`,
    storage: `${SETTINGS}/storage`,
  },
} as const;

const photosetParams = (photosetId: number) => ({ photosetId: String(photosetId) });

/** Build the URL for a wizard step of a photoset. */
export const wizardPath = (photosetId: number, step: WizardStepName) =>
  generatePath(routePatterns.wizard[step], photosetParams(photosetId));

/** URL builders for every route. Use these for every `navigate()`, `<Link>` and `<Navigate>`. */
export const paths = {
  home: () => routePatterns.home,
  newUpload: () => routePatterns.newUpload,
  photoset: (photosetId: number) =>
    generatePath(routePatterns.photoset, photosetParams(photosetId)),
  wizard: {
    picker: (photosetId: number) => wizardPath(photosetId, 'picker'),
    upload: (photosetId: number) => wizardPath(photosetId, 'upload'),
    s3: (photosetId: number) => wizardPath(photosetId, 's3'),
    summary: (photosetId: number) => wizardPath(photosetId, 'summary'),
  },
  settings: {
    general: () => routePatterns.settings.general,
    cameras: () => routePatterns.settings.cameras,
    storage: () => routePatterns.settings.storage,
  },
} as const;
