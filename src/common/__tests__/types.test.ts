import { describe, expect, it } from 'vitest';

import {
  albumSchema,
  imageProcessorResizeArgsSchema,
  outputImageSchema,
  photosetAddImagesArgsSchema,
  photosetCreateArgsSchema,
  photosetImageOutputSchema,
  photosetImageSchema,
  photosetListArgsSchema,
  photosetSchema,
  photosetUpdateArgsSchema,
  processedImageSchema,
} from '../types';

describe('outputImageSchema', () => {
  it('parses a valid output image', () => {
    const result = outputImageSchema.parse({
      imagePath: '/tmp/photo_640.jpg',
      type: 'jpg',
      resolution: 640,
      byteLength: 12345,
    });
    expect(result.type).toBe('jpg');
    expect(result.resolution).toBe(640);
  });

  it('accepts webp type', () => {
    const result = outputImageSchema.parse({
      imagePath: '/tmp/photo_640.webp',
      type: 'webp',
      resolution: 1280,
      byteLength: 9999,
    });
    expect(result.type).toBe('webp');
  });

  it('rejects invalid type', () => {
    expect(() =>
      outputImageSchema.parse({
        imagePath: '/tmp/photo.png',
        type: 'png',
        resolution: 640,
        byteLength: 100,
      }),
    ).toThrow();
  });

  it('rejects missing fields', () => {
    expect(() => outputImageSchema.parse({ imagePath: '/tmp/photo.jpg' })).toThrow();
  });
});

describe('processedImageSchema', () => {
  it('parses with optional fields omitted', () => {
    const result = processedImageSchema.parse({
      id: 'abc123',
      name: 'sunset.jpg',
      imagePaths: [],
    });
    expect(result.camera).toBeUndefined();
    expect(result.preview).toBeUndefined();
  });

  it('parses with nested imagePaths', () => {
    const result = processedImageSchema.parse({
      id: 'img1',
      name: 'beach.jpg',
      camera: 'Sony A7',
      imagePaths: [
        { imagePath: '/tmp/beach_640.jpg', type: 'jpg', resolution: 640, byteLength: 5000 },
        { imagePath: '/tmp/beach_640.webp', type: 'webp', resolution: 640, byteLength: 3000 },
      ],
    });
    expect(result.imagePaths).toHaveLength(2);
  });
});

describe('albumSchema', () => {
  it('parses a valid album', () => {
    const result = albumSchema.parse({
      name: 'Vacation',
      location: 'Paris',
      year: 2024,
      published: false,
    });
    expect(result.year).toBe(2024);
    expect(result.name).toBe('Vacation');
  });

  it('rejects year below 1900', () => {
    expect(() =>
      albumSchema.parse({ name: 'Old', location: 'Somewhere', year: 1899, published: false }),
    ).toThrow(/1900/);
  });

  it('rejects year above 2100', () => {
    expect(() =>
      albumSchema.parse({ name: 'Future', location: 'Mars', year: 2101, published: false }),
    ).toThrow(/2100/);
  });

  it('rejects empty name', () => {
    expect(() =>
      albumSchema.parse({ name: '', location: 'Here', year: 2024, published: false }),
    ).toThrow();
  });

  it('rejects name over 50 chars', () => {
    expect(() =>
      albumSchema.parse({
        name: 'A'.repeat(51),
        location: 'Here',
        year: 2024,
        published: false,
      }),
    ).toThrow(/50/);
  });

  it('accepts boundary years 1900 and 2100', () => {
    const low = albumSchema.parse({ name: 'A', location: 'B', year: 1900, published: false });
    const high = albumSchema.parse({ name: 'A', location: 'B', year: 2100, published: true });
    expect(low.year).toBe(1900);
    expect(high.year).toBe(2100);
  });
});

describe('photosetSchema', () => {
  const validPhotoset = {
    id: 1,
    name: 'Trip',
    location: 'Paris',
    year: 2024,
    bucketName: 'my-bucket',
    status: 'draft' as const,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    publishedAt: null,
    uploadedAt: null,
  };

  it('parses a valid photoset', () => {
    const result = photosetSchema.parse(validPhotoset);
    expect(result.status).toBe('draft');
  });

  it('accepts published status', () => {
    const result = photosetSchema.parse({ ...validPhotoset, status: 'published' });
    expect(result.status).toBe('published');
  });

  it('rejects invalid status', () => {
    expect(() => photosetSchema.parse({ ...validPhotoset, status: 'archived' })).toThrow();
  });

  it('allows nullable publishedAt, uploadedAt', () => {
    const result = photosetSchema.parse({
      ...validPhotoset,
      publishedAt: null,
      uploadedAt: null,
    });
    expect(result.publishedAt).toBeNull();
    expect(result.uploadedAt).toBeNull();
  });

  it('rejects null location', () => {
    expect(() => photosetSchema.parse({ ...validPhotoset, location: null })).toThrow();
  });

  it('rejects null year', () => {
    expect(() => photosetSchema.parse({ ...validPhotoset, year: null })).toThrow();
  });
});

describe('photosetImageSchema', () => {
  it('parses a valid photoset image', () => {
    const result = photosetImageSchema.parse({
      id: 1,
      photosetId: 1,
      name: 'sunset.jpg',
      camera: 'Sony A7',
      originalPath: '/photos/sunset.jpg',
      preview: 'data:image/jpeg;base64,...',
      sortOrder: 0,
      createdAt: '2024-01-01T00:00:00Z',
    });
    expect(result.name).toBe('sunset.jpg');
  });

  it('allows nullable camera and preview', () => {
    const result = photosetImageSchema.parse({
      id: 1,
      photosetId: 1,
      name: 'test.jpg',
      camera: null,
      originalPath: '/test.jpg',
      preview: null,
      sortOrder: 0,
      createdAt: '2024-01-01T00:00:00Z',
    });
    expect(result.camera).toBeNull();
    expect(result.preview).toBeNull();
  });
});

describe('photosetImageOutputSchema', () => {
  it('parses a valid output', () => {
    const result = photosetImageOutputSchema.parse({
      id: 1,
      imageId: 1,
      imagePath: '/tmp/out_640.jpg',
      type: 'jpg',
      resolution: 640,
      byteLength: 5000,
    });
    expect(result.resolution).toBe(640);
  });
});

describe('IPC arg schemas', () => {
  it('photosetListArgsSchema accepts undefined', () => {
    const result = photosetListArgsSchema.parse(undefined);
    expect(result).toBeUndefined();
  });

  it('photosetListArgsSchema accepts sort options', () => {
    const result = photosetListArgsSchema.parse({
      sortBy: 'name',
      sortOrder: 'asc',
    });
    expect(result?.sortBy).toBe('name');
  });

  it('photosetListArgsSchema rejects invalid sortBy', () => {
    expect(() => photosetListArgsSchema.parse({ sortBy: 'invalid' })).toThrow();
  });

  it('photosetCreateArgsSchema requires name, bucketName, location, and year', () => {
    expect(() => photosetCreateArgsSchema.parse({})).toThrow();
    expect(() => photosetCreateArgsSchema.parse({ name: 'Test', bucketName: 'bucket' })).toThrow();
    const result = photosetCreateArgsSchema.parse({ name: 'Test', bucketName: 'bucket', location: 'Paris', year: 2024 });
    expect(result.name).toBe('Test');
  });

  it('photosetUpdateArgsSchema requires id', () => {
    expect(() => photosetUpdateArgsSchema.parse({})).toThrow();
    const result = photosetUpdateArgsSchema.parse({ id: 1, name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('photosetAddImagesArgsSchema validates nested outputs', () => {
    const result = photosetAddImagesArgsSchema.parse({
      photosetId: 1,
      images: [
        {
          name: 'photo.jpg',
          originalPath: '/photos/photo.jpg',
          outputs: [{ imagePath: '/tmp/out.jpg', type: 'jpg', resolution: 640, byteLength: 1000 }],
        },
      ],
    });
    expect(result.images[0].outputs).toHaveLength(1);
  });

  it('imageProcessorResizeArgsSchema requires imagePaths array', () => {
    expect(() => imageProcessorResizeArgsSchema.parse({})).toThrow();
    const result = imageProcessorResizeArgsSchema.parse({ imagePaths: ['/a.jpg', '/b.jpg'] });
    expect(result.imagePaths).toHaveLength(2);
  });
});
