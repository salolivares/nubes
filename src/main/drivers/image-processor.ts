import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { IMAGE_PROCESSOR_COMPLETE, IMAGE_PROCESSOR_PROGRESS } from '@/common';
import type { ProcessedImage } from '@/common/types';

// TODO(sal): output to temporary directory
// TODO(sal): delete image cache after a while

async function processImage(
  imagePath: string,
  outputFolder: string,
  dryRun = true
): Promise<ProcessedImage> {
  console.log(`Processing ${imagePath}`);
  const name = path.basename(imagePath, path.extname(imagePath));
  const inputBuffer = fs.readFileSync(imagePath);

  // Create the output folder if it doesn't exist
  if (!dryRun && !fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  // Determine the input format
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();
  const inputFormat = metadata.format;

  // Rename the original file with its format
  const originalOutputPath = path.join(outputFolder, `${name}_original.${inputFormat}`);

  if (!dryRun) {
    fs.copyFileSync(imagePath, originalOutputPath);
  }

  const processedImage: ProcessedImage = {
    name,
    imagePaths: [],
  };

  for (const res of [128, 640, 1280, 2880]) {
    const jpgOutputFilename = path.join(outputFolder, `${name}_${res}.jpg`);
    const webpOutputFilename = path.join(outputFolder, `${name}_${res}.webp`);

    if (!dryRun) {
      await image.resize(res).toFormat('jpg').toFile(jpgOutputFilename);
      await image.resize(res).toFormat('webp').toFile(webpOutputFilename);

      processedImage.imagePaths.push({
        imagePath: jpgOutputFilename,
        type: 'jpg',
        resolution: res,
        byteLength: fs.readFileSync(jpgOutputFilename).byteLength,
      });

      processedImage.imagePaths.push({
        imagePath: webpOutputFilename,
        type: 'webp',
        resolution: res,
        byteLength: fs.readFileSync(webpOutputFilename).byteLength,
      });
    }
  }

  return processedImage;
}

process.parentPort.once('message', async (e) => {
  const [port] = e.ports;
  const { folderPaths, imagePaths, tempFolder, dryRun } = e.data;

  console.log('Processing images');
  console.log(folderPaths);
  console.log(imagePaths);
  console.log(tempFolder);
  console.log(dryRun);

  if (folderPaths && folderPaths.length > 0) {
    for (const folderPath of folderPaths) {
      const files = fs.readdirSync(folderPath);
      const images = files.filter((file) => file.match(/\.(png|jpe?g)$/i));

      for (const image of images) {
        const imagePath = path.join(folderPath, image);
        imagePaths.push(imagePath);
      }
    }
  }

  const processedImages: ProcessedImage[] = [];
  const erroredImagePaths: { error: string; path: string }[] = [];

  if (imagePaths && imagePaths.length > 0) {
    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];

      try {
        port.postMessage({
          type: IMAGE_PROCESSOR_PROGRESS,
          current: i + 1,
          total: imagePaths.length,
          name: path.basename(imagePath),
          path: imagePath,
        });

        const pip = await processImage(imagePath, tempFolder, dryRun);
        processedImages.push(pip);
      } catch (error) {
        console.error(`Error processing ${imagePath}: ${(error as Error).message}`);
        erroredImagePaths.push({
          error: (error as Error).message,
          path: imagePath,
        });
      }
    }
  }

  port.postMessage({
    type: IMAGE_PROCESSOR_COMPLETE,
    processedImages,
    erroredImagePaths,
  });
});
