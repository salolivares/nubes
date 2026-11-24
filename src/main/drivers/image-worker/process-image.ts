import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import type { ProcessedImage } from '@/common/types';

export const OUTPUT_RESOLUTIONS = [128, 640, 1280, 2880] as const;
const OUTPUT_TYPES = ['jpg', 'webp'] as const;

interface ProcessLog {
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

function outputPath(outputFolder: string, stem: string, res: number, type: string): string {
  return path.join(outputFolder, `${stem}_${res}.${type}`);
}

/**
 * A file name stem in `outputFolder` that no earlier output uses: `name`, then `name-2`,
 * `name-3`, and so on. Two sources called `IMG_0001.jpg` in one photoset (picked from two folders,
 * or added to a draft later) would otherwise overwrite each other's outputs.
 *
 * Checking the disk is enough because the worker runs one image at a time.
 */
export function uniqueOutputStem(outputFolder: string, name: string): string {
  const taken = (stem: string) =>
    OUTPUT_RESOLUTIONS.some((res) =>
      OUTPUT_TYPES.some((type) => fs.existsSync(outputPath(outputFolder, stem, res, type))),
    );
  let stem = name;
  for (let n = 2; taken(stem); n++) stem = `${name}-${n}`;
  return stem;
}

/** Resize one source image into every output size and format, under `outputFolder`. */
export async function processImage(
  imagePath: string,
  outputFolder: string,
  log?: ProcessLog,
): Promise<ProcessedImage> {
  const name = path.basename(imagePath, path.extname(imagePath));
  const inputBuffer = fs.readFileSync(imagePath);

  fs.mkdirSync(outputFolder, { recursive: true });

  const image = sharp(inputBuffer);
  const metadata = await image.metadata();
  const inputFormat = metadata.format;
  const width = metadata.width;
  const height = metadata.height;

  // Calculate a hash of the image content
  const hash = crypto.createHash('sha256').update(inputBuffer).digest('hex');

  // The stem, not the name, so two copies of one file picked from two folders get distinct IDs.
  const stem = uniqueOutputStem(outputFolder, name);

  // Generate a stable ID
  const id = `${stem}_${width}x${height}_${inputFormat}_${hash.substring(0, 16)}`;

  log?.info(
    `"${name}": ${width}x${height} ${inputFormat}, ${(inputBuffer.byteLength / 1024).toFixed(1)} KB, id=${id}, stem=${stem}`,
  );

  const imagePaths: ProcessedImage['imagePaths'] = [];

  for (const res of OUTPUT_RESOLUTIONS) {
    for (const type of OUTPUT_TYPES) {
      const filePath = outputPath(outputFolder, stem, res, type);
      await image.resize(res).toFormat(type).toFile(filePath);
      imagePaths.push({
        imagePath: filePath,
        type,
        resolution: res,
        byteLength: fs.statSync(filePath).size,
      });
    }
  }

  const preview = fs.readFileSync(outputPath(outputFolder, stem, 128, 'jpg')).toString('base64');

  const totalBytes = imagePaths.reduce((sum, p) => sum + p.byteLength, 0);
  log?.debug(
    `"${name}": ${imagePaths.length} variants, ${(totalBytes / 1024).toFixed(1)} KB total`,
  );

  return { id, name, imagePaths, preview };
}
