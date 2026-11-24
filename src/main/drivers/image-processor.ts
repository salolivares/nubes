import baseLog from 'electron-log/main';

import { imageWorkerRequestSchema } from '@/common/types';

import { processImage } from './image-worker/process-image';
import { createJobRunner } from './image-worker/runner';

const logFile = process.env.NUBES_LOG_FILE;
if (logFile) {
  baseLog.transports.file.resolvePathFn = () => logFile;
}

const log = baseLog.scope('ImageProcessor');

const runner = createJobRunner({
  processImage: (imagePath, outputFolder) => processImage(imagePath, outputFolder, log),
  post: (event) => process.parentPort.postMessage(event),
  log,
});

process.parentPort.on('message', (e) => {
  const parsed = imageWorkerRequestSchema.safeParse(e.data);
  if (!parsed.success) {
    log.error('Dropping invalid message from main:', parsed.error.message);
    return;
  }
  void runner.handle(parsed.data);
});

log.info('ImageProcessor worker ready');
