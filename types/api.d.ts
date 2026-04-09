import type {
  ImageProcessorResizeArgs,
  InProgressEvent,
  Photoset,
  PhotosetAddImagesArgs,
  PhotosetCreateArgs,
  PhotosetImage,
  PhotosetImageOutput,
  PhotosetListArgs,
  PhotosetUpdateArgs,
  ProcessedImage,
} from '../src/common/types';

declare global {
  interface StorageContext {
    secureRead: (key: bool) => Promise<string>;
    secureWrite: (key: string, value: string) => Promise<void>;
    read: (key: string) => Promise<string>;
    write: (key: string, value: string) => Promise<void>;
    onStorageChange: (
      listener: (
        event: IpcRendererEvent,
        args: { key: string; newValue: string; oldValue: string },
      ) => void,
    ) => () => void;
  }

  interface ThemeModeContext {
    toggle: () => Promise<boolean>;
    dark: () => Promise<void>;
    light: () => Promise<void>;
    system: () => Promise<boolean>;
    current: () => Promise<'dark' | 'light' | 'system'>;
  }

  interface ImageProcessorContext {
    resize: (args: ImageProcessorResizeArgs) => void;
    onProgressChange: (
      listener: (event: IpcRendererEvent, progress: InProgressEvent) => void,
    ) => () => void;
    onComplete: (
      listener: (
        event: IpcRendererEvent,
        result: { processedImages: ProcessedImage[]; erroredImagePaths: string[] },
      ) => void,
    ) => () => void;
  }

  interface ImagePickerFile {
    path: string;
    name: string;
  }

  interface ImagePickerContext {
    open: () => Promise<ImagePickerFile[]>;
    readThumbnail: (path: string) => Promise<string>;
    readPreview: (path: string) => Promise<string>;
  }

  interface PhotosetContext {
    list: (args?: PhotosetListArgs) => Promise<(Photoset & { images: { id: number }[] })[]>;
    get: (args: { id: number }) => Promise<
      | (Photoset & {
          images: (PhotosetImage & { outputs: PhotosetImageOutput[] })[];
        })
      | undefined
    >;
    create: (args: PhotosetCreateArgs) => Promise<Photoset>;
    update: (args: PhotosetUpdateArgs) => Promise<Photoset>;
    delete: (args: { id: number }) => Promise<void>;
    addImages: (args: PhotosetAddImagesArgs) => Promise<PhotosetImage[]>;
    publish: (args: { id: number }) => Promise<Photoset>;
    markUploaded: (args: { id: number }) => Promise<Photoset>;
    exportMetadata: (args: { id: number }) => Promise<{ filePath: string }>;
    showInFolder: (args: { filePath: string }) => Promise<void>;
  }

  interface CacheContext {
    getUsage: () => Promise<{ totalBytes: number; fileCount: number }>;
  }

  interface DebugContext {
    setMockS3: (enabled: boolean) => Promise<void>;
    isMockS3: () => Promise<boolean>;
    getMockS3Path: () => Promise<string>;
    openMockS3Path: () => Promise<void>;
    clearDb: () => Promise<void>;
    getDbPath: () => Promise<string>;
    copyToClipboard: (text: string) => Promise<void>;
  }

  interface Window {
    storage: StorageContext;
    themeMode: ThemeModeContext;
    imagePicker: ImagePickerContext;
    imageProcessor: ImageProcessorContext;
    photosets: PhotosetContext;
    cache: CacheContext;
    debug?: DebugContext;
  }
}

export {};
