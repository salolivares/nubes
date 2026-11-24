import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IMAGE_PROCESSOR_RESIZE,
  PHOTOSET_ADD_IMAGES,
  PHOTOSET_DELETE,
  PHOTOSET_REMOVE_FILES,
  PHOTOSET_SHOW_IN_FOLDER,
  PHOTOSETS_DIR,
  S3_CREATE_ALBUM,
} from '@/common';
import { photosetImageOutputs, photosetImages, photosets } from '@/common/db/schema';
import { createTestDb } from '@/main/__test-utils__/db';

/**
 * Calls the registered IPC handlers the way the renderer would, with paths inside and outside
 * `<userData>/photosets`. The checks themselves are covered in `media/__tests__/guards.test.ts`.
 */

const h = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, args: unknown) => Promise<unknown>>();
  const sender = {
    on: () => {},
    once: () => {},
    mainFrame: { url: 'file:///app/renderer/main_window/index.html', parent: null },
  };
  const window = { webContents: sender, isDestroyed: () => false };
  return {
    // Set below, once the imports have run. The mocks only read it when called.
    userData: '',
    handlers,
    event: { sender, senderFrame: sender.mainFrame },
    window,
    showItemInFolder: vi.fn(),
    postMessage: vi.fn(),
    db: null as unknown,
  };
});

vi.mock('electron', () => ({
  app: { getPath: () => h.userData, on: () => {}, quit: () => {} },
  BrowserWindow: { fromWebContents: () => h.window, getAllWindows: () => [] },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, args: unknown) => Promise<unknown>) =>
      h.handlers.set(channel, handler),
  },
  shell: { showItemInFolder: h.showItemInFolder },
  protocol: {},
  net: {},
  utilityProcess: {
    fork: () => ({ postMessage: h.postMessage, kill: () => true, on: () => {}, once: () => {} }),
  },
}));

vi.mock('electron-log/main', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    default: {
      ...logger,
      scope: () => logger,
      transports: { file: { getFile: () => ({ path: '/tmp/nubes-test/main.log' }) } },
    },
  };
});

vi.mock('sharp', () => ({ default: vi.fn() }));

vi.mock('@/main/drivers/database', () => ({
  Database: {
    get instance() {
      return { db: h.db };
    },
  },
}));

vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', '');

h.userData = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nubes-ipc-paths-')));
const { db, close } = createTestDb();
h.db = db;

const photosetsDir = path.join(h.userData, PHOTOSETS_DIR);
const outsideDir = path.join(h.userData, '..', path.basename(h.userData) + '-outside');
const createAlbum = vi.fn(async () => ({ success: true }));

function write(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'img');
  return filePath;
}

function call(channel: string, args: unknown) {
  const handler = h.handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return handler(h.event, args);
}

beforeAll(async () => {
  const { setS3Provider } = await import('@/main/drivers/s3');
  setS3Provider({ listBuckets: async () => [], listImagesInBucket: async () => [], createAlbum });
  const { addS3EventListeners } = await import('@/main/listeners/s3');
  const { addImageProcessorEventListeners } = await import('@/main/listeners/image-processor');
  const { addPhotosetEventListeners } = await import('@/main/listeners/photoset');
  addS3EventListeners();
  addImageProcessorEventListeners();
  addPhotosetEventListeners();
});

afterAll(async () => {
  close();
  await fsp.rm(h.userData, { recursive: true, force: true });
  await fsp.rm(outsideDir, { recursive: true, force: true });
});

beforeEach(async () => {
  vi.clearAllMocks();
  db.delete(photosetImageOutputs).run();
  db.delete(photosetImages).run();
  db.delete(photosets).run();
  const { mediaAccess } = await import('@/main/media');
  mediaAccess.clearPicked();
});

const output = (imagePath: string) => ({
  imagePath,
  type: 'jpg' as const,
  resolution: 128,
  byteLength: 3,
});

const albumArgs = (...imagePaths: string[]) => ({
  bucketName: 'mock-photos-bucket',
  album: { name: 'Trip', location: 'Here', year: 2026, published: false },
  images: [{ id: 'a', name: 'a', imagePaths: imagePaths.map(output) }],
});

describe('s3:createAlbum', () => {
  it('uploads outputs from the photosets folder', async () => {
    const file = write(path.join(photosetsDir, '1', 'a_128.jpg'));
    await expect(call(S3_CREATE_ALBUM, albumArgs(file))).resolves.toEqual({ success: true });
    expect(createAlbum).toHaveBeenCalledOnce();
  });

  it('refuses the whole call when any path is outside, before the provider runs', async () => {
    const good = write(path.join(photosetsDir, '1', 'a_128.jpg'));
    const secret = write(path.join(outsideDir, 'id_rsa.jpg'));
    await expect(call(S3_CREATE_ALBUM, albumArgs(good, secret))).rejects.toThrow(/Refused/);
    expect(createAlbum).not.toHaveBeenCalled();
  });
});

describe('image-processor:resize', () => {
  function photoset() {
    const [ps] = db
      .insert(photosets)
      .values({ name: 'S', location: 'L', year: 2026, bucketName: 'b' })
      .returning()
      .all();
    return ps.id;
  }

  it("forwards picked files to the worker, writing to the photoset's own folder", async () => {
    const picked = write(path.join(outsideDir, 'IMG_0001.jpg'));
    const { allowPickedFiles } = await import('@/main/media');
    await allowPickedFiles([picked]);
    const photosetId = photoset();

    await expect(
      call(IMAGE_PROCESSOR_RESIZE, { photosetId, imagePaths: [picked] }),
    ).resolves.toMatchObject({ imagePaths: [picked] });
    expect(h.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'resize',
        imagePaths: [picked],
        outputFolder: path.join(photosetsDir, String(photosetId)),
      }),
    );
  });

  it('refuses a file that was never picked, without starting a job', async () => {
    const other = write(path.join(outsideDir, 'private.jpg'));
    await expect(
      call(IMAGE_PROCESSOR_RESIZE, { photosetId: photoset(), imagePaths: [other] }),
    ).rejects.toThrow(/Refused to process/);
    expect(h.postMessage).not.toHaveBeenCalled();
  });

  it('refuses a photoset that does not exist, without starting a job', async () => {
    const picked = write(path.join(outsideDir, 'IMG_0001.jpg'));
    const { allowPickedFiles } = await import('@/main/media');
    await allowPickedFiles([picked]);

    await expect(
      call(IMAGE_PROCESSOR_RESIZE, { photosetId: 9999, imagePaths: [picked] }),
    ).rejects.toThrow('Photoset 9999 not found');
    expect(h.postMessage).not.toHaveBeenCalled();
  });
});

describe('photoset:delete and photoset:removeFiles', () => {
  function seed(originalPath: string, outputPath: string) {
    const [ps] = db
      .insert(photosets)
      .values({ name: 'S', location: 'L', year: 2026, bucketName: 'b' })
      .returning()
      .all();
    const [img] = db
      .insert(photosetImages)
      .values({ photosetId: ps.id, name: 'a', originalPath, sortOrder: 0 })
      .returning()
      .all();
    db.insert(photosetImageOutputs)
      .values({ ...output(outputPath), imageId: img.id })
      .run();
    return ps.id;
  }

  it('unlinks photoset files but leaves a stored path outside the folder alone', async () => {
    const inRoot = write(path.join(photosetsDir, '1', 'a_128.jpg'));
    const outside = write(path.join(outsideDir, 'DSCF0001.jpg'));
    const id = seed(outside, inRoot);

    await call(PHOTOSET_DELETE, { id });

    expect(fs.existsSync(inRoot)).toBe(false);
    expect(fs.existsSync(outside)).toBe(true);
    expect(db.select().from(photosets).all()).toHaveLength(0);
  });

  it('removeFiles skips paths outside the folder', async () => {
    const inRoot = write(path.join(photosetsDir, '2', 'b_128.jpg'));
    const outside = write(path.join(outsideDir, 'keep.jpg'));

    await call(PHOTOSET_REMOVE_FILES, { filePaths: [inRoot, outside] });

    expect(fs.existsSync(inRoot)).toBe(false);
    expect(fs.existsSync(outside)).toBe(true);
  });
});

describe('photoset:addImages', () => {
  it('stores outputs in the photosets folder and refuses outside ones', async () => {
    const [ps] = db
      .insert(photosets)
      .values({ name: 'S', location: 'L', year: 2026, bucketName: 'b' })
      .returning()
      .all();
    const inRoot = path.join(photosetsDir, '1', 'a_128.jpg');
    const outside = path.join(outsideDir, 'a.jpg');
    const image = (p: string) => ({ name: 'a', originalPath: p, outputs: [output(p)] });

    await expect(
      call(PHOTOSET_ADD_IMAGES, { photosetId: ps.id, images: [image(inRoot)] }),
    ).resolves.toHaveLength(1);
    await expect(
      call(PHOTOSET_ADD_IMAGES, { photosetId: ps.id, images: [image(outside)] }),
    ).rejects.toThrow(/Refused to save/);
    expect(db.select().from(photosetImages).all()).toHaveLength(1);
  });
});

describe('photoset:showInFolder', () => {
  it('reveals a file in the photosets folder', async () => {
    const file = path.join(photosetsDir, '1', 'a_128.jpg');
    await call(PHOTOSET_SHOW_IN_FOLDER, { filePath: file });
    expect(h.showItemInFolder).toHaveBeenCalledWith(file);
  });

  it('refuses a path outside, and args that fail the schema', async () => {
    await expect(
      call(PHOTOSET_SHOW_IN_FOLDER, { filePath: path.join(outsideDir, 'a.txt') }),
    ).rejects.toThrow(/Refused to reveal/);
    await expect(call(PHOTOSET_SHOW_IN_FOLDER, { filePath: 42 })).rejects.toThrow();
    expect(h.showItemInFolder).not.toHaveBeenCalled();
  });
});
