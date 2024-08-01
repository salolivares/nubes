import fs from 'node:fs';
import path from 'node:path';

import prettyBytes from 'pretty-bytes';
import sharp from 'sharp';

import {
  IMAGE_PROCESSOR_COMPLETE,
  IMAGE_PROCESSOR_ERROR,
  IMAGE_PROCESSOR_PROGRESS,
} from '@/common';

async function processImage(path: string) {
  const name = path.split('.')[0];
  const inputBuffer = fs.readFileSync(path);

  // Determine the input format
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();
  const inputFormat = metadata.format;

  // Rename the original file with its format
  fs.renameSync(path, `${name}_original.${inputFormat}`);

  for (const res of [128, 640, 1280, 2880]) {
    const jpgOutputFilename = `${name}_${res}.jpg`;
    const webpOutputFilename = `${name}_${res}.webp`;

    await image.resize(res).toFormat('jpg').toFile(jpgOutputFilename);
    await image.resize(res).toFormat('webp').toFile(webpOutputFilename);

    // TODO(sal): Send this to frontend somehow
    console.log(`${res}x webp ${prettyBytes(fs.readFileSync(webpOutputFilename).byteLength)}`);
    console.log(`${res}x jpg ${prettyBytes(fs.readFileSync(jpgOutputFilename).byteLength)}`);
  }
}

process.parentPort.once('message', async (e) => {
  const [port] = e.ports;
  const { folderPaths, imagePaths } = e.data;

  for (const folderPath of folderPaths) {
    const files = fs.readdirSync(folderPath);
    const images = files.filter((file) => file.match(/\.(png|jpe?g)$/i));

    for (const image of images) {
      const imagePath = path.join(folderPath, image);
      imagePaths.push(imagePath);
    }
  }

  for (let i = 0; i < imagePaths.length; i++) {
    const imagePath = imagePaths[i];

    try {
      await processImage(imagePath);
      port.postMessage({
        type: IMAGE_PROCESSOR_PROGRESS,
        current: i + 1,
        total: imagePaths.length,
        path: imagePath,
      });
    } catch (error) {
      port.postMessage({
        type: IMAGE_PROCESSOR_ERROR,
        error: (error as Error).message,
        path: imagePath,
      });
    }
  }

  port.postMessage({ type: IMAGE_PROCESSOR_COMPLETE });
});
