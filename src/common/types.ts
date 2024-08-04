export interface OutputImage {
  imagePath: string;
  type: 'jpg' | 'webp';
  resolution: number;
  byteLength: number;
}

export interface ProcessedImage {
  id: string;
  name: string;
  imagePaths: OutputImage[];
}

export interface InProgressEvent {
  current: number;
  total: number;
  path: string;
  name: string;
  id: string;
}
