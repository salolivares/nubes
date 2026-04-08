import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getCacheUsage } from '@/main/listeners/cache';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nubes-cache-test-'));
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe('getCacheUsage', () => {
  it('returns correct totals for a directory with files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.jpg'), Buffer.alloc(1024));
    fs.writeFileSync(path.join(tmpDir, 'b.webp'), Buffer.alloc(2048));

    const usage = await getCacheUsage(tmpDir);
    expect(usage.totalBytes).toBe(3072);
    expect(usage.fileCount).toBe(2);
  });

  it('returns zeros when directory does not exist', async () => {
    const usage = await getCacheUsage(path.join(tmpDir, 'nonexistent'));
    expect(usage.totalBytes).toBe(0);
    expect(usage.fileCount).toBe(0);
  });

  it('counts files in nested subdirectories', async () => {
    const subDir = path.join(tmpDir, 'sub');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(tmpDir, 'root.jpg'), Buffer.alloc(500));
    fs.writeFileSync(path.join(subDir, 'nested.jpg'), Buffer.alloc(300));

    const usage = await getCacheUsage(tmpDir);
    expect(usage.totalBytes).toBe(800);
    expect(usage.fileCount).toBe(2);
  });
});
