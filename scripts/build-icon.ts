/**
 * Renders assets/icon.svg into the app icons:
 *
 * - assets/icon.icns: the packaged app icon (`packagerConfig.icon` in forge.config.cts).
 * - assets/icon.png: the dock icon in dev, where there is no app bundle to carry the .icns.
 *
 * Both outputs are committed, so this only needs to run after the SVG changes. macOS only,
 * since it calls `iconutil`. Run with `pnpm icon`.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';

const assetsDir = path.resolve(import.meta.dirname, '..', 'assets');
const svg = await fs.readFile(path.join(assetsDir, 'icon.svg'));

// Render at the source's 72 dpi scaled up, so every size is drawn from vectors, not resampled.
const render = (size: number) =>
  sharp(svg, { density: (72 * size) / 1024 })
    .resize(size, size)
    .png()
    .toBuffer();

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nubes-icon-'));
const iconset = path.join(tmp, 'icon.iconset');
await fs.mkdir(iconset);
try {
  for (const size of [16, 32, 128, 256, 512]) {
    await fs.writeFile(path.join(iconset, `icon_${size}x${size}.png`), await render(size));
    await fs.writeFile(path.join(iconset, `icon_${size}x${size}@2x.png`), await render(size * 2));
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(assetsDir, 'icon.icns')]);
  await fs.writeFile(path.join(assetsDir, 'icon.png'), await render(1024));
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}
