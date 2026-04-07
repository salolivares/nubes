import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import baseLog from 'electron-log/main';
import sharp from 'sharp';

import { IMAGE_PROCESSOR_COMPLETE, IMAGE_PROCESSOR_PROGRESS } from '@/common';
import type { ProcessedImage } from '@/common/types';

const log = baseLog.scope('ImageProcessor');

async function processImage(
  imagePath: string,
  outputFolder: string,
  dryRun = true,
): Promise<ProcessedImage> {
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
  const width = metadata.width;
  const height = metadata.height;

  // Calculate a hash of the image content
  const hash = crypto.createHash('sha256').update(inputBuffer).digest('hex');

  // Generate a stable ID
  const id = `${name}_${width}x${height}_${inputFormat}_${hash.substring(0, 16)}`;

  log.info(
    `"${name}": ${width}x${height} ${inputFormat}, ${(inputBuffer.byteLength / 1024).toFixed(1)} KB, id=${id}`,
  );

  // Rename the original file with its format
  const originalOutputPath = path.join(outputFolder, `${name}_original.${inputFormat}`);

  if (!dryRun) {
    fs.copyFileSync(imagePath, originalOutputPath);
  }

  const imagePaths: ProcessedImage['imagePaths'] = [];

  for (const res of [128, 640, 1280, 2880]) {
    const jpgOutputFilename = path.join(outputFolder, `${name}_${res}.jpg`);
    const webpOutputFilename = path.join(outputFolder, `${name}_${res}.webp`);

    if (!dryRun) {
      await image.resize(res).toFormat('jpg').toFile(jpgOutputFilename);
      await image.resize(res).toFormat('webp').toFile(webpOutputFilename);

      const jpgSize = fs.readFileSync(jpgOutputFilename).byteLength;
      const webpSize = fs.readFileSync(webpOutputFilename).byteLength;

      imagePaths.push({
        imagePath: jpgOutputFilename,
        type: 'jpg',
        resolution: res,
        byteLength: jpgSize,
      });

      imagePaths.push({
        imagePath: webpOutputFilename,
        type: 'webp',
        resolution: res,
        byteLength: webpSize,
      });
    }
  }

  const preview = fs.readFileSync(path.join(outputFolder, `${name}_128.jpg`)).toString('base64');

  if (!dryRun) {
    const totalBytes = imagePaths.reduce((sum, p) => sum + p.byteLength, 0);
    log.debug(`"${name}": ${imagePaths.length} variants, ${(totalBytes / 1024).toFixed(1)} KB total`);
  }

  return { id, name, imagePaths, preview };
}

// Receive the MessagePort once at init, then handle resize commands on it
process.parentPort.once('message', (e) => {
  const [port] = e.ports;
  port.start();
  log.info('ImageProcessor worker ready');

  port.on('message', async (msg) => {
    const { folderPaths, imagePaths, tempFolder, dryRun } = msg.data;

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

    log.info(
      `Batch started: ${imagePaths?.length ?? 0} image(s) from ${folderPaths?.length ?? 0} folder(s), dryRun=${dryRun}`,
    );

    const processedImages: ProcessedImage[] = [];
    const erroredImagePaths: { error: string; path: string }[] = [];

    if (imagePaths && imagePaths.length > 0) {
      for (let i = 0; i < imagePaths.length; i++) {
        const imagePath = imagePaths[i];

        try {
          const pip = await processImage(imagePath, tempFolder, dryRun);
          processedImages.push(pip);
          port.postMessage({
            type: IMAGE_PROCESSOR_PROGRESS,
            current: i + 1,
            total: imagePaths.length,
            name: path.basename(imagePath),
            id: pip.id,
            path: imagePath,
          });
        } catch (error) {
          log.error(`Error processing ${imagePath}: ${(error as Error).message}`);
          erroredImagePaths.push({
            error: (error as Error).message,
            path: imagePath,
          });
        }
      }
    }

    log.info(
      `Batch complete: ${processedImages.length} succeeded, ${erroredImagePaths.length} failed`,
    );

    port.postMessage({
      type: IMAGE_PROCESSOR_COMPLETE,
      processedImages,
      erroredImagePaths,
    });
  });
});
