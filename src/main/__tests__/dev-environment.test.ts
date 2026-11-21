import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DevEnvironmentInput } from '@/main/dev-environment';
import {
  isLinkedWorktreeGitFile,
  readDotGitFile,
  resolveDevEnvironment,
} from '@/main/dev-environment';

const APP_DATA = '/Users/me/Library/Application Support';
const WORKTREE = '/repos/nubes-worktrees/feature';
const WORKTREE_GIT_FILE = 'gitdir: /repos/nubes/.git/worktrees/feature\n';
const SUBMODULE_GIT_FILE = 'gitdir: ../../.git/modules/nubes\n';

function input(overrides: Partial<DevEnvironmentInput> = {}): DevEnvironmentInput {
  return {
    isPackaged: false,
    env: {},
    appDataPath: APP_DATA,
    appRoot: WORKTREE,
    dotGitFile: null,
    ...overrides,
  };
}

describe('isLinkedWorktreeGitFile', () => {
  it('matches an absolute gitdir inside .git/worktrees', () => {
    expect(isLinkedWorktreeGitFile(WORKTREE_GIT_FILE, WORKTREE)).toBe(true);
  });

  it('matches a relative gitdir inside .git/worktrees', () => {
    expect(
      isLinkedWorktreeGitFile('gitdir: ../../nubes/.git/worktrees/feature', '/repos/wt/feature'),
    ).toBe(true);
  });

  it('tolerates CRLF line endings', () => {
    expect(
      isLinkedWorktreeGitFile('gitdir: /repos/nubes/.git/worktrees/feature\r\n', WORKTREE),
    ).toBe(true);
  });

  it('rejects submodules, whose gitdir points into .git/modules', () => {
    expect(isLinkedWorktreeGitFile(SUBMODULE_GIT_FILE, '/repos/parent/vendor/nubes')).toBe(false);
  });

  it('rejects a directory merely named worktrees outside .git', () => {
    expect(isLinkedWorktreeGitFile('gitdir: /repos/worktrees/feature', WORKTREE)).toBe(false);
  });

  it('rejects a gitdir pointing at the worktrees folder itself', () => {
    expect(isLinkedWorktreeGitFile('gitdir: /repos/nubes/.git/worktrees', WORKTREE)).toBe(false);
  });

  it('rejects files without a gitdir line', () => {
    expect(isLinkedWorktreeGitFile('not a git file', WORKTREE)).toBe(false);
    expect(isLinkedWorktreeGitFile('', WORKTREE)).toBe(false);
  });
});

describe('readDotGitFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nubes-devenv-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns the contents when .git is a file', () => {
    fs.writeFileSync(path.join(tmpDir, '.git'), WORKTREE_GIT_FILE);
    expect(readDotGitFile(tmpDir)).toBe(WORKTREE_GIT_FILE);
  });

  it('returns null when .git is a directory (main checkout)', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'));
    expect(readDotGitFile(tmpDir)).toBeNull();
  });

  it('returns null when there is no .git', () => {
    expect(readDotGitFile(tmpDir)).toBeNull();
  });
});

describe('resolveDevEnvironment', () => {
  it('leaves packaged builds alone and ignores every override', () => {
    expect(
      resolveDevEnvironment(
        input({
          isPackaged: true,
          env: { NUBES_USER_DATA: '/tmp/x', NUBES_MOCK_S3: '1' },
          dotGitFile: WORKTREE_GIT_FILE,
        }),
      ),
    ).toEqual({
      userDataPath: null,
      userDataSource: 'packaged',
      mockS3: false,
      mockS3Source: 'packaged',
    });
  });

  it('uses nubes-dev for the main checkout', () => {
    const result = resolveDevEnvironment(input());
    expect(result.userDataPath).toBe(path.join(APP_DATA, 'nubes-dev'));
    expect(result.userDataSource).toBe('dev-default');
  });

  it('uses <worktree>/.dev-data for a linked worktree', () => {
    const result = resolveDevEnvironment(input({ dotGitFile: WORKTREE_GIT_FILE }));
    expect(result.userDataPath).toBe(path.join(WORKTREE, '.dev-data'));
    expect(result.userDataSource).toBe('worktree');
  });

  it('uses nubes-dev for a submodule checkout', () => {
    const result = resolveDevEnvironment(input({ dotGitFile: SUBMODULE_GIT_FILE }));
    expect(result.userDataSource).toBe('dev-default');
  });

  it('lets NUBES_USER_DATA override the worktree folder', () => {
    const result = resolveDevEnvironment(
      input({ env: { NUBES_USER_DATA: '/tmp/custom' }, dotGitFile: WORKTREE_GIT_FILE }),
    );
    expect(result.userDataPath).toBe(path.resolve('/tmp/custom'));
    expect(result.userDataSource).toBe('env');
  });

  it('ignores an empty or blank NUBES_USER_DATA', () => {
    for (const value of ['', '   ']) {
      const result = resolveDevEnvironment(input({ env: { NUBES_USER_DATA: value } }));
      expect(result.userDataSource).toBe('dev-default');
    }
  });

  it('defaults to mock S3 in dev', () => {
    const result = resolveDevEnvironment(input());
    expect(result.mockS3).toBe(true);
    expect(result.mockS3Source).toBe('dev-default');
  });

  it('honors NUBES_MOCK_S3=0 and NUBES_MOCK_S3=1', () => {
    expect(resolveDevEnvironment(input({ env: { NUBES_MOCK_S3: '0' } }))).toMatchObject({
      mockS3: false,
      mockS3Source: 'env',
    });
    expect(resolveDevEnvironment(input({ env: { NUBES_MOCK_S3: '1' } }))).toMatchObject({
      mockS3: true,
      mockS3Source: 'env',
    });
  });

  it('treats other NUBES_MOCK_S3 values as unset', () => {
    expect(resolveDevEnvironment(input({ env: { NUBES_MOCK_S3: 'yes' } }))).toMatchObject({
      mockS3: true,
      mockS3Source: 'dev-default',
    });
  });

  it('no longer lets NUBES_E2E change anything', () => {
    expect(resolveDevEnvironment(input({ env: { NUBES_E2E: '1' } }))).toEqual(
      resolveDevEnvironment(input()),
    );
  });
});
