import path from 'path';
import sharp from 'sharp';

// process.on('message', async (message: { imagePaths: string[]; width: number; height: number }) => {
//   const { imagePaths, width, height } = message;

//   if (!process.send) {
//     throw new Error('The process.send method is not available');
//   }

//   for (let i = 0; i < imagePaths.length; i++) {
//     const imagePath = imagePaths[i];
//     try {
//       await sharp(imagePath)
//         .resize(width, height)
//         .toFile(path.join(path.dirname(imagePath), `resized_${path.basename(imagePath)}`));

//       // Report progress
//       process.send({
//         type: 'progress',
//         current: i + 1,
//         total: imagePaths.length,
//         imagePath: imagePath,
//       });
//     } catch (error) {
//       process.send({
//         type: 'error',
//         error: (error as Error).message,
//         imagePath: imagePath,
//       });
//     }
//   }

//   process.send({ type: 'complete' });
// });

process.parentPort.once('message', (e) => {
  const [port] = e.ports;
  port.postMessage('pong');
  port.postMessage('pgasdfasdf');
});
