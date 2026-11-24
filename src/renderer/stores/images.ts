import { create } from 'zustand';

import type { ProcessedImage } from '@/common/types';

import { useImageJobStore } from './image-jobs';

export interface CustomFile extends File {
  path?: string;
  preview?: string;
}

interface State {
  files: CustomFile[];
  /** The image processing job for this upload. Its progress lives in useImageJobStore. */
  jobId: string | null;
  /** Bumped whenever the selection changes or the store resets, so stale job replies can tell. */
  selectionVersion: number;
  processedImages: ProcessedImage[];
  processed: boolean;
}

interface Action {
  addFiles: (files: CustomFile[]) => void;
  addFilesFromPaths: (entries: { path: string; name: string }[]) => void;
  setFilePreview: (filePath: string, preview: string) => void;
  removeFile: (index: number) => void;
  removeAllFiles: () => void;
  unloadPreviews: () => void;
  loadPreviews: () => void;
  setJobId: (jobId: string | null) => void;
  setProcessedImages: (files: ProcessedImage[]) => void;
  setProcessed: (processed: boolean) => void;
  setProcessedImage: (id: string, props: Partial<Pick<ProcessedImage, 'name' | 'camera'>>) => void;
  /** Drop the job and results so the next processing run starts fresh on the current files. */
  clearResults: () => void;
  reset: () => void;
}

/**
 * A new selection invalidates the old job and its results. Cancel the job too: nothing will read
 * its results, and the worker runs one job at a time, so it would hold up the next one.
 */
function selectionChanged(state: State): Partial<State> {
  if (state.jobId) void useImageJobStore.getState().cancel(state.jobId);
  return {
    jobId: null,
    processed: false,
    processedImages: [],
    selectionVersion: state.selectionVersion + 1,
  };
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
  jobId: null,
  selectionVersion: 0,
  processedImages: [],
  processed: false,
  addFiles: (files: File[]) =>
    set((state) => ({
      ...selectionChanged(state),
      files: [
        ...state.files,
        ...files.map((file) => createCustomFile(file, URL.createObjectURL(file))),
      ],
    })),
  addFilesFromPaths: (entries: { path: string; name: string }[]) =>
    set((state) => ({
      ...selectionChanged(state),
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
        file.path === filePath ? Object.assign(file, { preview }) : file,
      ),
    })),
  removeFile: (index: number) =>
    set((state) => {
      const updatedFiles = [...state.files];
      if (state.files[index].preview?.startsWith('blob:')) {
        URL.revokeObjectURL(state.files[index].preview);
      }
      updatedFiles.splice(index, 1);
      return { ...selectionChanged(state), files: updatedFiles };
    }),
  removeAllFiles: () =>
    set((state) => {
      state.files.forEach((file) => {
        if (file.preview?.startsWith('blob:')) URL.revokeObjectURL(file.preview);
      });
      return { ...selectionChanged(state), files: [] };
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
  setJobId: (jobId: string | null) => set({ jobId }),
  setProcessedImages: (files: ProcessedImage[]) => set({ processedImages: files }),
  setProcessed: (processed: boolean) => set({ processed }),
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
  clearResults: () => set((state) => selectionChanged(state)),
  reset: () =>
    set((state) => {
      if (state.jobId) void useImageJobStore.getState().cancel(state.jobId);
      state.files.forEach((file) => {
        if (file.preview?.startsWith('blob:')) URL.revokeObjectURL(file.preview);
      });
      return {
        files: [],
        jobId: null,
        selectionVersion: state.selectionVersion + 1,
        processedImages: [],
        processed: false,
      };
    }),
}));
