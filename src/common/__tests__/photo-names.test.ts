import { describe, expect, it } from 'vitest';

import {
  defaultPhotoNames,
  isDefaultPhotoName,
  PHOTO_NAME_IS_FILENAME,
  PHOTO_NAME_REQUIRED,
  photoNameError,
  photoNameErrors,
} from '../photo-names';

// What process-image.ts writes for a source called IMG_0001.JPG.
const outputs = (stem: string) => [
  `/data/photosets/7/${stem}_128.jpg`,
  `/data/photosets/7/${stem}_128.webp`,
  `/data/photosets/7/${stem}_2880.jpg`,
];

describe('defaultPhotoNames', () => {
  it('reads the file name back from the output paths', () => {
    expect(defaultPhotoNames(outputs('IMG_0001'))).toEqual(['IMG_0001']);
  });

  it('also returns the original name when the stem was deduplicated', () => {
    expect(defaultPhotoNames(outputs('IMG_0001-2'))).toEqual(['IMG_0001-2', 'IMG_0001']);
  });

  it('returns nothing for paths that are not processing outputs', () => {
    expect(defaultPhotoNames(['/tmp/a-640.jpg', ''])).toEqual([]);
  });

  it('handles Windows separators', () => {
    expect(defaultPhotoNames(['C:\\photos\\DSC_42_640.webp'])).toEqual(['DSC_42']);
  });
});

describe('isDefaultPhotoName', () => {
  it.each(['IMG_0001', ' IMG_0001 '])('flags %j as the file name', (name) => {
    expect(isDefaultPhotoName(name, outputs('IMG_0001'))).toBe(true);
  });

  it('flags the original name of a deduplicated photo', () => {
    expect(isDefaultPhotoName('IMG_0001', outputs('IMG_0001-2'))).toBe(true);
  });

  it.each(['Sunset over Tokyo', 'IMG_0001 at dusk', 'IMG_0002'])('accepts %j', (name) => {
    expect(isDefaultPhotoName(name, outputs('IMG_0001'))).toBe(false);
  });

  it('counts a change of case as a name', () => {
    expect(isDefaultPhotoName('Sunset', outputs('sunset'))).toBe(false);
  });
});

describe('photoNameError', () => {
  it.each(['', '   '])('requires a name (%j)', (name) => {
    expect(photoNameError(name, outputs('IMG_0001'))).toBe(PHOTO_NAME_REQUIRED);
  });

  it('rejects the file name', () => {
    expect(photoNameError('IMG_0001', outputs('IMG_0001'))).toBe(PHOTO_NAME_IS_FILENAME);
  });

  it('accepts a real name', () => {
    expect(photoNameError('Shibuya crossing', outputs('IMG_0001'))).toBeUndefined();
  });

  it('only checks for an empty name when there are no outputs', () => {
    expect(photoNameError('IMG_0001', [])).toBeUndefined();
    expect(photoNameError('', [])).toBe(PHOTO_NAME_REQUIRED);
  });
});

describe('photoNameErrors', () => {
  it('lists unnamed photos in order, keyed by id', () => {
    const errors = photoNameErrors([
      { id: 'a', name: 'Named', outputPaths: outputs('A') },
      { id: 'b', name: 'B', outputPaths: outputs('B') },
      { id: 'c', name: '', outputPaths: outputs('C') },
    ]);
    expect([...errors]).toEqual([
      ['b', PHOTO_NAME_IS_FILENAME],
      ['c', PHOTO_NAME_REQUIRED],
    ]);
  });
});
