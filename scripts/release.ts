/**
 * Cuts a release: tags the current commit `v<version>`, builds the zip, pushes the tag and
 * creates a GitHub release with the zip attached. The app reads its version from that tag
 * (see build-info.ts), so nothing in the repo changes.
 *
 * Run with `make release VERSION=1.2.0`. It only releases a clean checkout of origin/main.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { isReleaseVersion } from '../src/common/build-version.ts';

const projectDir = path.resolve(import.meta.dirname, '..');

function run(command: string, args: string[]): string {
  return execFileSync(command, args, { cwd: projectDir, encoding: 'utf8' }).trim();
}

function step(command: string, args: string[]): void {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd: projectDir, stdio: 'inherit' });
}

function fail(message: string): never {
  console.error(`release: ${message}`);
  process.exit(1);
}

const version = process.argv[2] ?? '';
if (!isReleaseVersion(version)) fail(`expected a version like 1.2.0, got "${version}"`);
const tag = `v${version}`;

step('git', ['fetch', 'origin', 'main', '--tags']);
if (run('git', ['status', '--porcelain']) !== '') fail('the working tree has uncommitted changes');
if (run('git', ['rev-parse', 'HEAD']) !== run('git', ['rev-parse', 'origin/main'])) {
  fail('HEAD is not origin/main. Check out the latest main first');
}
if (run('git', ['tag', '--list', tag]) !== '') fail(`tag ${tag} already exists`);

step('git', ['tag', '--annotate', tag, '--message', `Nubes ${version}`]);
try {
  step('pnpm', ['make']);
} catch {
  step('git', ['tag', '--delete', tag]);
  fail(`the build failed, so ${tag} was deleted and nothing was published`);
}

const zipDir = path.join(projectDir, 'out', 'make', 'zip', 'darwin');
const zips = fs
  .readdirSync(zipDir, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith(`-${version}.zip`))
  .map((file) => path.join(zipDir, file));
if (zips.length === 0) {
  step('git', ['tag', '--delete', tag]);
  fail(`no zip for ${version} in ${zipDir}, so ${tag} was deleted and nothing was published`);
}

step('git', ['push', 'origin', tag]);
step('gh', [
  'release',
  'create',
  tag,
  ...zips,
  '--verify-tag',
  '--title',
  `Nubes ${version}`,
  '--generate-notes',
]);
console.log(`\nReleased ${tag}. Run \`make install\` to install this build.`);
