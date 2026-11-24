import { describe, expect, it } from 'vitest';

import { previewDataUrl, thumbnailUrl } from '../media';

describe('thumbnailUrl', () => {
  it('picks the smallest jpg and encodes its path', () => {
    expect(
      thumbnailUrl([
        { imagePath: '/p/a_640.jpg', type: 'jpg', resolution: 640 },
        { imagePath: '/p/a_128.webp', type: 'webp', resolution: 128 },
        { imagePath: '/p/a_128.jpg', type: 'jpg', resolution: 128 },
      ]),
    ).toBe('nubes-media://media/%2Fp%2Fa_128.jpg');
  });

  it('returns undefined without jpg outputs', () => {
    expect(thumbnailUrl([])).toBeUndefined();
  });
});

describe('previewDataUrl', () => {
  it('wraps the DB preview in a data URL', () => {
    expect(previewDataUrl('abc')).toBe('data:image/jpeg;base64,abc');
    expect(previewDataUrl(null)).toBeUndefined();
  });
});
