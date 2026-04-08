import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProcessedImage } from '@/common/types';

import { useImageStore } from '../images';

function makeFile(name: string, size = 100): File {
  return new File([new ArrayBuffer(size)], name, { type: 'image/jpeg' });
}

describe('useImageStore', () => {
  beforeEach(() => {
    useImageStore.getState().reset();
    vi.mocked(URL.createObjectURL).mockReturnValue('blob:mock-url');
    vi.mocked(URL.revokeObjectURL).mockClear();
  });

  describe('addFiles', () => {
    it('appends files with blob previews', () => {
      useImageStore.getState().addFiles([makeFile('a.jpg')]);
      useImageStore.getState().addFiles([makeFile('b.jpg')]);

      const { files } = useImageStore.getState();
      expect(files).toHaveLength(2);
      expect(files[0].name).toBe('a.jpg');
      expect(files[1].name).toBe('b.jpg');
      expect(files[0].preview).toBe('blob:mock-url');
    });
  });

  describe('addFilesFromPaths', () => {
    it('creates entries with .path property', () => {
      useImageStore.getState().addFilesFromPaths([
        { path: '/photos/sunset.jpg', name: 'sunset.jpg' },
        { path: '/photos/beach.jpg', name: 'beach.jpg' },
      ]);

      const { files } = useImageStore.getState();
      expect(files).toHaveLength(2);
      expect(files[0].path).toBe('/photos/sunset.jpg');
      expect(files[0].name).toBe('sunset.jpg');
    });

    it('appends to existing files', () => {
      useImageStore.getState().addFiles([makeFile('existing.jpg')]);
      useImageStore.getState().addFilesFromPaths([{ path: '/new.jpg', name: 'new.jpg' }]);

      expect(useImageStore.getState().files).toHaveLength(2);
    });
  });

  describe('removeFile', () => {
    it('removes file at index', () => {
      useImageStore.getState().addFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);
      useImageStore.getState().removeFile(1);

      const names = useImageStore.getState().files.map((f) => f.name);
      expect(names).toEqual(['a.jpg', 'c.jpg']);
    });

    it('revokes blob URL on removal', () => {
      useImageStore.getState().addFiles([makeFile('a.jpg')]);
      useImageStore.getState().removeFile(0);

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });
  });

  describe('initializeProcessingImages', () => {
    it('maps files to ProcessingImage with 0% progress', () => {
      useImageStore.getState().addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
      useImageStore.getState().initializeProcessingImages();

      const { processingImages } = useImageStore.getState();
      expect(processingImages).toHaveLength(2);
      expect(processingImages[0].name).toBe('a.jpg');
      expect(processingImages[0].progress).toBe(0);
      expect(processingImages[1].name).toBe('b.jpg');
    });

    it('preserves existing progress for known files', () => {
      useImageStore.getState().addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
      useImageStore.getState().setProcessingImages([
        { name: 'a.jpg', progress: 50, file: makeFile('a.jpg') },
      ]);
      useImageStore.getState().initializeProcessingImages();

      const { processingImages } = useImageStore.getState();
      expect(processingImages[0].progress).toBe(50);
      expect(processingImages[1].progress).toBe(0);
    });
  });

  describe('setProcessedImage', () => {
    const images: ProcessedImage[] = [
      { id: 'img1', name: 'sunset.jpg', imagePaths: [] },
      { id: 'img2', name: 'beach.jpg', imagePaths: [] },
    ];

    it('updates matching image by id', () => {
      useImageStore.getState().setProcessedImages(images);
      useImageStore.getState().setProcessedImage('img1', { name: 'Golden Sunset', camera: 'Sony A7' });

      const updated = useImageStore.getState().processedImages;
      expect(updated[0].name).toBe('Golden Sunset');
      expect(updated[0].camera).toBe('Sony A7');
      expect(updated[1].name).toBe('beach.jpg');
    });

    it('no-ops for unknown id', () => {
      useImageStore.getState().setProcessedImages(images);
      useImageStore.getState().setProcessedImage('unknown', { name: 'Nope' });

      const result = useImageStore.getState().processedImages;
      expect(result).toEqual(images);
    });
  });

  describe('reset', () => {
    it('returns to initial state', () => {
      useImageStore.getState().setPhotosetId(42);
      useImageStore.getState().addFiles([makeFile('a.jpg')]);
      useImageStore.getState().setProcessed(true);
      useImageStore.getState().reset();

      const state = useImageStore.getState();
      expect(state.photosetId).toBeNull();
      expect(state.files).toEqual([]);
      expect(state.processingImages).toEqual([]);
      expect(state.processedImages).toEqual([]);
      expect(state.processed).toBe(false);
    });

    it('revokes blob URLs on reset', () => {
      useImageStore.getState().addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
      useImageStore.getState().reset();

      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeAllFiles', () => {
    it('clears all files and revokes previews', () => {
      useImageStore.getState().addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
      useImageStore.getState().removeAllFiles();

      expect(useImageStore.getState().files).toEqual([]);
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    });
  });

  describe('setFilePreview', () => {
    it('sets preview on file matching path', () => {
      useImageStore.getState().addFilesFromPaths([{ path: '/photos/a.jpg', name: 'a.jpg' }]);
      useImageStore.getState().setFilePreview('/photos/a.jpg', 'data:image/jpeg;base64,abc');

      expect(useImageStore.getState().files[0].preview).toBe('data:image/jpeg;base64,abc');
    });
  });
});
