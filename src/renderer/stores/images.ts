import type { File } from 'node:buffer';

import { create } from 'zustand';

export interface CustomFile extends File {
  path?: string;
  preview?: string;
}

interface State {
  files: CustomFile[];
}

interface Action {
  addFiles: (files: CustomFile[]) => void;
  removeFile: (index: number) => void;
  removeAllFiles: () => void;
  unloadPreviews: () => void;
  loadPreviews: () => void;
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
