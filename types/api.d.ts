import type { Bucket } from '@aws-sdk/client-s3';

import type {
  CredentialsStatus,
  DroppedFiles,
  ImageJob,
  ImageJobEvent,
  ImageProcessorResizeArgs,
  Photoset,
  PhotosetAddImagesArgs,
  PhotosetCreateArgs,
  PhotosetImage,
  PhotosetImageOutput,
  PhotosetListArgs,
  PhotosetRemoveFilesArgs,
  PhotosetUpdateArgs,
  S3CreateAlbumArgs,
  SecureStorageKey,
  StorageChange,
} from '../src/common/types';

declare global {
  interface StorageContext {
    /** Whether credentials are saved. Never returns the secret access key. */
    credentialsStatus: () => Promise<CredentialsStatus>;
    /** Saves a credential encrypted. There is no matching read. */
    secureWrite: (key: SecureStorageKey, value: string) => Promise<void>;
    read: (key: string) => Promise<string>;
    write: (key: string, value: string) => Promise<void>;
    /** Fires when a plain key changes (today only the AWS region). */
    onStorageChange: (listener: (change: StorageChange) => void) => () => void;
    /** Fires with the new status whenever a credential is saved or cleared. */
    onCredentialsChange: (listener: (status: CredentialsStatus) => void) => () => void;
  }

  interface ThemeModeContext {
    toggle: () => Promise<boolean>;
    dark: () => Promise<void>;
    light: () => Promise<void>;
    system: () => Promise<boolean>;
    current: () => Promise<'dark' | 'light' | 'system'>;
  }

  interface ImageProcessorContext {
    /** Queue a resize job. Resolves with the job's snapshot, including its jobId. */
    resize: (args: ImageProcessorResizeArgs) => Promise<ImageJob>;
    /** Stop the job after the image in progress. A queued job never starts. */
    cancel: (jobId: string) => Promise<void>;
    /** Main's current snapshot of a job, or null if it is unknown or was pruned. */
    getJob: (jobId: string) => Promise<ImageJob | null>;
    /** Every job event, for every job. Returns an unsubscribe function. */
    onEvent: (listener: (event: ImageJobEvent) => void) => () => void;
  }

  interface ImagePickerFile {
    path: string;
    name: string;
  }

  interface ImagePickerContext {
    open: () => Promise<ImagePickerFile[]>;
    /**
     * Allows dropped files that are on disk. Returns them by path, plus the names of files with no
     * path on disk (e.g. dragged from a browser) or that main refused.
     */
    addDroppedFiles: (files: File[]) => Promise<DroppedFiles>;
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
    removeFiles: (args: PhotosetRemoveFilesArgs) => Promise<void>;
    showInFolder: (args: { filePath: string }) => Promise<void>;
  }

  interface CacheContext {
    getUsage: () => Promise<{ totalBytes: number; fileCount: number }>;
  }

  interface S3Context {
    /** True when uploads go to the local mock bucket instead of AWS. */
    isMock: () => Promise<boolean>;
    listBuckets: () => Promise<Bucket[]>;
    createAlbum: (args: S3CreateAlbumArgs) => Promise<{ success: boolean }>;
  }

  interface DebugContext {
    setMockS3: (enabled: boolean) => Promise<void>;
    isMockS3: () => Promise<boolean>;
    getMockS3Path: () => Promise<string>;
    openMockS3Path: () => Promise<void>;
    clearDb: () => Promise<void>;
    getDbPath: () => Promise<string>;
    copyToClipboard: (text: string) => Promise<void>;
    /** Kill the image worker as if it crashed. Resolves false if none was running. */
    killImageWorker: () => Promise<boolean>;
  }

  interface Window {
    storage: StorageContext;
    themeMode: ThemeModeContext;
    imagePicker: ImagePickerContext;
    imageProcessor: ImageProcessorContext;
    photosets: PhotosetContext;
    cache: CacheContext;
    s3: S3Context;
    debug?: DebugContext;
  }
}

export {};
