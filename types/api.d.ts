interface StorageContext {
  secureRead: (key: bool) => Promise<string>;
  secureWrite: (key: string, value: string) => Promise<void>;
  read: (key: string) => Promise<string>;
  write: (key: string, value: string) => Promise<void>;
  onStorageChange: (listener: (event: IpcRendererEvent, ...args: any[]) => void) => () => void;
}

interface ThemeModeContext {
  toggle: () => Promise<boolean>;
  dark: () => Promise<void>;
  light: () => Promise<void>;
  system: () => Promise<boolean>;
  current: () => Promise<'dark' | 'light' | 'system'>;
}

interface ImageProcessorContext {
  resize: (imagePaths: string[]) => void;
  onProgressChange: (listener: (event: IpcRendererEvent, ...args: any[]) => void) => () => void;
  onComplete: (listener: (event: IpcRendererEvent, ...args: any[]) => void) => () => void;
}

interface ImagePickerFile {
  path: string;
  name: string;
}

interface ImagePickerContext {
  open: () => Promise<ImagePickerFile[]>;
  readThumbnail: (path: string) => Promise<string>;
}

interface Photoset {
  id: number;
  name: string;
  location: string | null;
  year: number | null;
  bucketName: string;
  status: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  uploadedAt: string | null;
}

interface PhotosetImage {
  id: number;
  photosetId: number;
  name: string;
  camera: string | null;
  originalPath: string;
  preview: string | null;
  sortOrder: number;
  createdAt: string;
}

interface PhotosetImageOutput {
  id: number;
  imageId: number;
  imagePath: string;
  type: 'jpg' | 'webp';
  resolution: number;
  byteLength: number;
}

interface PhotosetListOptions {
  sortBy?: 'name' | 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc';
  status?: 'draft' | 'published';
}

interface PhotosetContext {
  list: (args?: PhotosetListOptions) => Promise<(Photoset & { images: { id: number }[] })[]>;
  get: (args: { id: number }) => Promise<
    | (Photoset & {
        images: (PhotosetImage & { outputs: PhotosetImageOutput[] })[];
      })
    | undefined
  >;
  create: (args: {
    name: string;
    bucketName: string;
    location?: string;
    year?: number;
  }) => Promise<Photoset>;
  update: (args: {
    id: number;
    name?: string;
    location?: string;
    year?: number;
    status?: 'draft' | 'published';
  }) => Promise<Photoset>;
  delete: (args: { id: number }) => Promise<void>;
  addImages: (args: {
    photosetId: number;
    images: Array<{
      name: string;
      camera?: string;
      originalPath: string;
      preview?: string;
      sortOrder?: number;
      outputs: Array<{
        imagePath: string;
        type: 'jpg' | 'webp';
        resolution: number;
        byteLength: number;
      }>;
    }>;
  }) => Promise<PhotosetImage[]>;
  publish: (args: { id: number }) => Promise<Photoset>;
  markUploaded: (args: { id: number }) => Promise<Photoset>;
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

declare interface Window {
  storage: StorageContext;
  themeMode: ThemeModeContext;
  imagePicker: ImagePickerContext;
  imageProcessor: ImageProcessorContext;
  photosets: PhotosetContext;
  debug?: DebugContext;
}
