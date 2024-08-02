import fs from 'node:fs';
import path from 'node:path';

import prettyBytes from 'pretty-bytes';
import sharp from 'sharp';

import { IMAGE_PROCESSOR_COMPLETE, IMAGE_PROCESSOR_PROGRESS } from '@/common';

// TODO(sal): output to temporary directory
// TODO(sal): delete image cache after a while

async function processImage(imagePath: string, outputFolder: string): Promise<string[]> {
  console.log(`Processing ${imagePath}`);
  console.log(`Output folder: ${outputFolder}`);
  const name = path.basename(imagePath, path.extname(imagePath));
  const inputBuffer = fs.readFileSync(imagePath);

  // Create the output folder if it doesn't exist
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  // Determine the input format
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();
  const inputFormat = metadata.format;

  // Rename the original file with its format
  const originalOutputPath = path.join(outputFolder, `${name}_original.${inputFormat}`);
  fs.copyFileSync(imagePath, originalOutputPath);

  const processedImagePaths: string[] = [];

  for (const res of [128, 640, 1280, 2880]) {
    const jpgOutputFilename = path.join(outputFolder, `${name}_${res}.jpg`);
    const webpOutputFilename = path.join(outputFolder, `${name}_${res}.webp`);

    processedImagePaths.push(jpgOutputFilename);
    processedImagePaths.push(webpOutputFilename);

    await image.resize(res).toFormat('jpg').toFile(jpgOutputFilename);
    await image.resize(res).toFormat('webp').toFile(webpOutputFilename);

    // TODO(sal): Send this to frontend somehow
    console.log(`${res}x webp ${prettyBytes(fs.readFileSync(webpOutputFilename).byteLength)}`);
    console.log(`${res}x jpg ${prettyBytes(fs.readFileSync(jpgOutputFilename).byteLength)}`);
  }

  return processedImagePaths;
}

process.parentPort.once('message', async (e) => {
  const [port] = e.ports;
  const { folderPaths, imagePaths, tempFolder } = e.data;

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

  const processedImagePaths: string[] = [];
  const erroredImagePaths: { error: string; path: string }[] = [];

  if (imagePaths && imagePaths.length > 0) {
    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];

      try {
        port.postMessage({
          type: IMAGE_PROCESSOR_PROGRESS,
          current: i + 1,
          total: imagePaths.length,
          path: imagePath,
        });

        const pip = await processImage(imagePath, tempFolder);
        processedImagePaths.push(...pip);
      } catch (error) {
        console.error(`Error processing ${imagePath}: ${(error as Error).message}`);
        erroredImagePaths.push({
          error: (error as Error).message,
          path: imagePath,
        });
      }
    }
  }

  port.postMessage({ type: IMAGE_PROCESSOR_COMPLETE, processedImagePaths, erroredImagePaths });
});
