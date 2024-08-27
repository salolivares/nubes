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
  files: CustomFile[];
  processingImages: ProcessingImage[];
  processedImages: ProcessedImage[];
  processed: boolean;
}

interface Action {
  addFiles: (files: CustomFile[]) => void;
  removeFile: (index: number) => void;
  removeAllFiles: () => void;
  unloadPreviews: () => void;
  loadPreviews: () => void;
  setProcessingImages: (files: ProcessingImage[]) => void;
  setProcessedImages: (files: ProcessedImage[]) => void;
  setProcessed: (processed: boolean) => void;
  initializeProcessingImages: () => void;
  setProcessedImage: (id: string, props: Partial<Pick<ProcessedImage, 'name' | 'camera'>>) => void;
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
  files: [],
  processingImages: [],
  processedImages: [],
  processed: false,
  addFiles: (files: File[]) =>
    set((state) => ({
      files: [
        ...state.files,
        ...files.map((file) => createCustomFile(file, URL.createObjectURL(file))),
      ],
    })),
  removeFile: (index: number) =>
    set((state) => {
      const updatedFiles = [...state.files];
      if (state.files[index].preview) {
        URL.revokeObjectURL(state.files[index].preview);
      }
      updatedFiles.splice(index, 1);
      return { files: updatedFiles };
    }),
  removeAllFiles: () =>
    set((state) => {
      state.files.forEach((file) => {
        if (file.preview) URL.revokeObjectURL(file.preview);
      });
      return { files: [] };
    }),
  unloadPreviews: () =>
    set((state) => ({
      files: state.files.map((file) => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
        return createCustomFile(file);
      }),
    })),
  loadPreviews: () =>
    set((state) => ({
      files: state.files.map((file) =>
        createCustomFile(file, file.preview ?? URL.createObjectURL(file))
      ),
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
}));

export const useImageStoreSelectors = () => {
  return useImageStore((state) => ({
    files: state.files,
    addFiles: state.addFiles,
    removeFile: state.removeFile,
    removeAllFiles: state.removeAllFiles,
    unloadPreviews: state.unloadPreviews,
  }));
};
