import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { uniqueOutputStem } from '@/main/drivers/image-worker/process-image';
import { photosetOutputFolder } from '@/main/photoset-folders';

let folder: string;

beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'nubes-stem-'));
});

afterEach(() => fs.rmSync(folder, { recursive: true, force: true }));

const touch = (name: string) => fs.writeFileSync(path.join(folder, name), 'x');

describe('uniqueOutputStem', () => {
  it('uses the source name when nothing is there yet', () => {
    expect(uniqueOutputStem(folder, 'IMG_0001')).toBe('IMG_0001');
  });

  it('counts up past every stem that has any output', () => {
    // One leftover variant is enough to take a stem: a half-written image from a crash counts.
    touch('IMG_0001_2880.webp');
    expect(uniqueOutputStem(folder, 'IMG_0001')).toBe('IMG_0001-2');

    touch('IMG_0001-2_128.jpg');
    expect(uniqueOutputStem(folder, 'IMG_0001')).toBe('IMG_0001-3');
  });

  it('ignores files that are not outputs of that stem', () => {
    touch('IMG_0001.jpg');
    touch('IMG_00010_128.jpg');
    expect(uniqueOutputStem(folder, 'IMG_0001')).toBe('IMG_0001');
  });
});

describe('photosetOutputFolder', () => {
  it('puts each photoset in a folder named after its id', () => {
    expect(photosetOutputFolder('/data/photosets', 12)).toBe(path.join('/data/photosets', '12'));
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('refuses id %s', (id) => {
    expect(() => photosetOutputFolder('/data/photosets', id)).toThrow('Invalid photoset id');
  });
});
