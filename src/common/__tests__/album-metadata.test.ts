import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  albumId,
  AlbumMetadataError,
  albumMetadataFilename,
  buildAlbumMetadata,
  serializeAlbumMetadata,
  travelAlbumSchema,
} from '../album-metadata';

// Copied unchanged from salolivares/salolivares.com `src/content/travel/`.
function siteAlbum(file: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf-8'));
}

const album = {
  name: 'Denmark',
  description: 'A month in Copenhagen.',
  location: 'Denmark',
  year: 2025,
  month: 9,
  published: true,
};

describe('travelAlbumSchema', () => {
  it.each(['2025-denmark.json', '2017-japan.json'])('accepts %s from the site', (file) => {
    expect(travelAlbumSchema.safeParse(siteAlbum(file)).success).toBe(true);
  });

  it('rejects an album without a description', () => {
    const { description: _, ...rest } = siteAlbum('2025-denmark.json') as Record<string, unknown>;
    expect(travelAlbumSchema.safeParse(rest).success).toBe(false);
  });

  it.each([0, 13, 1.5])('rejects month %s', (month) => {
    const data = { ...(siteAlbum('2025-denmark.json') as object), month };
    expect(travelAlbumSchema.safeParse(data).success).toBe(false);
  });

  it('rejects an image without an id', () => {
    const data = { ...(siteAlbum('2017-japan.json') as object), images: [{ name: 'Skytree' }] };
    expect(travelAlbumSchema.safeParse(data).success).toBe(false);
  });
});

describe('albumId', () => {
  it('is the S3 prefix and the JSON filename stem', () => {
    expect(albumId({ year: 2025, location: 'Tepic, Nayarit' })).toBe('2025-tepic-nayarit');
    expect(albumMetadataFilename({ year: 2025, location: 'Tepic, Nayarit' })).toBe(
      '2025-tepic-nayarit.json',
    );
  });

  it('ignores the album name', () => {
    expect(albumMetadataFilename({ year: 2017, location: 'Japan' })).toBe('2017-japan.json');
  });
});

describe('buildAlbumMetadata', () => {
  it('emits JSON the site accepts', () => {
    const metadata = buildAlbumMetadata(album, [
      { name: 'Gammel Strand entrance', camera: 'Fujifilm X-T30 II' },
      { name: 'windmills', camera: null },
      { name: 'the quiet train', camera: '' },
    ]);

    expect(metadata).toEqual({
      title: 'Denmark',
      description: 'A month in Copenhagen.',
      location: 'Denmark',
      year: 2025,
      month: 9,
      published: true,
      images: [
        {
          id: 'gammel-strand-entrance',
          name: 'Gammel Strand entrance',
          camera: 'Fujifilm X-T30 II',
        },
        { id: 'windmills', name: 'windmills' },
        { id: 'the-quiet-train', name: 'the quiet train' },
      ],
    });
    const roundTrip = JSON.parse(serializeAlbumMetadata(metadata));
    expect(travelAlbumSchema.parse(roundTrip)).toEqual(metadata);
  });

  it('leaves out a missing month', () => {
    const metadata = buildAlbumMetadata({ ...album, month: undefined }, []);
    expect('month' in metadata).toBe(false);
    const fromDb = buildAlbumMetadata({ ...album, month: null }, []);
    expect('month' in fromDb).toBe(false);
  });

  it('throws a readable error for a missing description', () => {
    const noDescription = { ...album, description: undefined as unknown as string };
    expect(() => buildAlbumMetadata(noDescription, [])).toThrow(/description/);
  });

  it('throws a readable error for a month out of range', () => {
    expect(() => buildAlbumMetadata({ ...album, month: 13 }, [])).toThrow(AlbumMetadataError);
    expect(() => buildAlbumMetadata({ ...album, month: 13 }, [])).toThrow(/month/);
  });

  it('rejects two photos whose names make the same id', () => {
    const build = () =>
      buildAlbumMetadata(album, [{ name: 'IMG_0001' }, { name: 'img0001!' }, { name: 'Other' }]);
    expect(build).toThrow(AlbumMetadataError);
    expect(build).toThrow(/"img0001"/);
  });

  it('rejects photos that still have their file name or no name', () => {
    const imagePaths = (stem: string) => [{ imagePath: `/data/photosets/7/${stem}_640.jpg` }];
    const build = () =>
      buildAlbumMetadata(album, [
        { name: 'Harbour', imagePaths: imagePaths('DSC_0001') },
        { name: 'DSC_0002', imagePaths: imagePaths('DSC_0002') },
        { name: '  ', imagePaths: imagePaths('DSC_0003') },
      ]);
    expect(build).toThrow(AlbumMetadataError);
    expect(build).toThrow(/photo 2 \("DSC_0002"\), photo 3 \(""\)/);
  });

  it.each([
    ['a fractional year', { year: 2026.5 }],
    ['a location with no letters or numbers', { location: '!!!' }],
  ])('rejects %s, which would give a broken album id', (_, override) => {
    expect(() => buildAlbumMetadata({ ...album, ...override }, [])).toThrow(/album id/);
  });

  it('serializes like the site files, with a trailing newline', () => {
    const text = serializeAlbumMetadata(buildAlbumMetadata(album, []));
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "title": "Denmark",\n');
  });
});
