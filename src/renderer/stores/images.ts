import type { File } from 'node:buffer';

import { create } from 'zustand';

import type { ProcessedImage } from '@/common/types';

export interface CustomFile extends File {
  path?: string;
  preview?: string;
}

export interface ProcessingImage {
  name: string;
  progress: number;
  file: CustomFile;
}

interface State {
  photosetId: number | null;
  files: CustomFile[];
  processingImages: ProcessingImage[];
  processedImages: ProcessedImage[];
  processed: boolean;
}

interface Action {
  setPhotosetId: (id: number) => void;
  addFiles: (files: CustomFile[]) => void;
  addFilesFromPaths: (entries: { path: string; name: string }[]) => void;
  setFilePreview: (filePath: string, preview: string) => void;
  removeFile: (index: number) => void;
  removeAllFiles: () => void;
  unloadPreviews: () => void;
  loadPreviews: () => void;
  setProcessingImages: (files: ProcessingImage[]) => void;
  setProcessedImages: (files: ProcessedImage[]) => void;
  setProcessed: (processed: boolean) => void;
  initializeProcessingImages: () => void;
  setProcessedImage: (id: string, props: Partial<Pick<ProcessedImage, 'name' | 'camera'>>) => void;
  reset: () => void;
}

function createCustomFile(file: File, preview?: string): CustomFile {
  return Object.assign(file, { preview });
}

/**
 * Image store for managing image uploads.
 *
 * Please call unloadPreviews() when the component unmounts to prevent memory leaks.
 *
 * TODO(sal): figure out a way to automatically call unloadPreviews() when the component unmounts.
 */
export const useImageStore = create<State & Action>()((set) => ({
  photosetId: null,
  files: [],
  processingImages: [],
  processedImages: [],
  processed: false,
  setPhotosetId: (id: number) => set({ photosetId: id }),
  addFiles: (files: File[]) =>
    set((state) => ({
      files: [
        ...state.files,
        ...files.map((file) => createCustomFile(file, URL.createObjectURL(file))),
      ],
    })),
  addFilesFromPaths: (entries: { path: string; name: string }[]) =>
    set((state) => ({
      files: [
        ...state.files,
        ...entries.map((entry) => {
          const file = new File([], entry.name);
          Object.defineProperty(file, 'path', { value: entry.path, writable: false });
          return file as CustomFile;
        }),
      ],
    })),
  setFilePreview: (filePath: string, preview: string) =>
    set((state) => ({
      files: state.files.map((file) =>
        file.path === filePath ? Object.assign(file, { preview }) : file
      ),
    })),
  removeFile: (index: number) =>
    set((state) => {
      const updatedFiles = [...state.files];
      if (state.files[index].preview?.startsWith('blob:')) {
        URL.revokeObjectURL(state.files[index].preview);
      }
      updatedFiles.splice(index, 1);
      return { files: updatedFiles };
    }),
  removeAllFiles: () =>
    set((state) => {
      state.files.forEach((file) => {
        if (file.preview?.startsWith('blob:')) URL.revokeObjectURL(file.preview);
      });
      return { files: [] };
    }),
  unloadPreviews: () =>
    set((state) => ({
      files: state.files.map((file) => {
        if (file.preview?.startsWith('blob:')) {
          URL.revokeObjectURL(file.preview);
          return createCustomFile(file);
        }
        // Preserve data URL previews (e.g. from dialog-selected files)
        return createCustomFile(file, file.preview);
      }),
    })),
  loadPreviews: () =>
    set((state) => ({
      files: state.files.map((file) => {
        if (file.preview) return createCustomFile(file, file.preview);
        // Only create object URLs for files with actual data
        if (file.size > 0) return createCustomFile(file, URL.createObjectURL(file));
        return createCustomFile(file);
      }),
    })),
  setProcessingImages: (files: ProcessingImage[]) => set({ processingImages: files }),
  setProcessedImages: (files: ProcessedImage[]) => set({ processedImages: files }),
  setProcessed: (processed: boolean) => set({ processed }),
  initializeProcessingImages: () =>
    set((state) => {
      const existingProcessingImages = state.processingImages.reduce((acc, img) => {
        acc[img.name] = img;
        return acc;
      }, {} as Record<string, ProcessingImage>);

      const updatedProcessingImages = state.files.map((file) => {
        const existingImage = existingProcessingImages[file.name];
        if (existingImage) {
          return existingImage; // Preserve existing progress
        }
        return {
          name: file.name,
          file,
          progress: 0,
        };
      });

      return { processingImages: updatedProcessingImages };
    }),
  setProcessedImage: (id: string, props) =>
    set((state) => {
      const processedImages = state.processedImages.map((img) => {
        if (img.id === id) {
          return { ...img, ...props };
        }
        return img;
      });

      return { processedImages };
    }),
  reset: () =>
    set((state) => {
      state.files.forEach((file) => {
        if (file.preview?.startsWith('blob:')) URL.revokeObjectURL(file.preview);
      });
      return { photosetId: null, files: [], processingImages: [], processedImages: [], processed: false };
    }),
}));

export const useImageStoreSelectors = () => {
  return useImageStore((state) => ({
    files: state.files,
    addFiles: state.addFiles,
    addFilesFromPaths: state.addFilesFromPaths,
    setFilePreview: state.setFilePreview,
    removeFile: state.removeFile,
    removeAllFiles: state.removeAllFiles,
    unloadPreviews: state.unloadPreviews,
  }));
};
