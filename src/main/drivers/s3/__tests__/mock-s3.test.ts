import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MockS3 } from '../mock-s3';

const electron = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({ app: { getPath: () => electron.userData } }));

const album = {
  name: 'Trip',
  description: 'A drive up the coast.',
  location: 'Big Sur',
  year: 2024,
  published: false,
};

describe('MockS3.createAlbum', () => {
  beforeEach(() => {
    electron.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'nubes-mock-s3-test-'));
  });

  afterEach(() => {
    fs.rmSync(electron.userData, { recursive: true, force: true });
  });

  it('rejects a photo that still has its file name before writing anything', async () => {
    const imagePath = path.join(electron.userData, 'IMG_0001_640.jpg');
    fs.writeFileSync(imagePath, 'jpg');

    const result = await new MockS3().createAlbum('bucket', album, [
      {
        id: 'a',
        name: 'IMG_0001',
        imagePaths: [{ imagePath, type: 'jpg', resolution: 640, byteLength: 3 }],
      },
    ]);

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/photo 1 \("IMG_0001"\)/),
    });
    expect(fs.existsSync(path.join(electron.userData, 'mock-s3'))).toBe(false);
  });
});
