import fs from 'node:fs';
import path from 'node:path';

/**
 * Startup decisions for where app data lives and which S3 provider to use.
 *
 * Kept free of Electron imports and side effects so `src/main/index.ts` can
 * call it before `app.setPath('userData', ...)` and tests can run it in Node.
 */

export const DEV_DATA_DIR = '.dev-data';
export const DEV_APP_DATA_NAME = 'nubes-dev';

export type UserDataSource = 'packaged' | 'env' | 'worktree' | 'dev-default';
export type MockS3Source = 'packaged' | 'env' | 'dev-default';

export interface DevEnvironmentInput {
  isPackaged: boolean;
  env: Record<string, string | undefined>;
  /** `app.getPath('appData')` */
  appDataPath: string;
  /** Root of the checkout the app runs from (`app.getAppPath()` in dev). */
  appRoot: string;
  /** Contents of `<appRoot>/.git` when it is a file, otherwise null. */
  dotGitFile: string | null;
}

export interface DevEnvironment {
  /** Folder to pass to `app.setPath('userData')`, or null to keep Electron's default. */
  userDataPath: string | null;
  userDataSource: UserDataSource;
  mockS3: boolean;
  mockS3Source: MockS3Source;
  /**
   * Open album PRs in the local mock instead of on github.com. On in dev unless
   * NUBES_MOCK_GITHUB=0, and independent of the S3 mode, so testing real S3 never opens a real PR.
   */
  mockGitHub: boolean;
  mockGitHubSource: MockS3Source;
  /**
   * Launch without taking focus: no dock icon, window shown inactive. For agents and e2e tests
   * driving the app while someone works in another window. Set with NUBES_BACKGROUND=1.
   */
  background: boolean;
}

/**
 * True when `.git` file contents point at `<repo>/.git/worktrees/<name>`,
 * which is what `git worktree add` writes. Submodules also use a `.git` file,
 * but theirs points into `.git/modules/`, so they don't match.
 */
export function isLinkedWorktreeGitFile(dotGitFile: string, appRoot: string): boolean {
  const match = /^gitdir:\s*(.+?)\s*$/m.exec(dotGitFile);
  if (!match) return false;

  const gitdir = path.resolve(appRoot, match[1]).split(path.sep).join('/');
  return /\/\.git\/worktrees\/[^/]+\/?$/.test(gitdir);
}

/** Reads `<root>/.git` if it is a regular file. Returns null for a directory or missing file. */
export function readDotGitFile(root: string): string | null {
  try {
    const dotGit = path.join(root, '.git');
    if (!fs.statSync(dotGit).isFile()) return null;
    return fs.readFileSync(dotGit, 'utf8');
  } catch {
    return null;
  }
}

function parseMockFlag(value: string | undefined): boolean | null {
  if (value === '1') return true;
  if (value === '0') return false;
  return null;
}

export function resolveDevEnvironment(input: DevEnvironmentInput): DevEnvironment {
  const { isPackaged, env, appDataPath, appRoot, dotGitFile } = input;

  // Packaged builds ignore every override: real data folder, real S3.
  if (isPackaged) {
    return {
      userDataPath: null,
      userDataSource: 'packaged',
      mockS3: false,
      mockS3Source: 'packaged',
      mockGitHub: false,
      mockGitHubSource: 'packaged',
      background: false,
    };
  }

  let userDataPath: string;
  let userDataSource: UserDataSource;
  const envUserData = env.NUBES_USER_DATA?.trim();
  if (envUserData) {
    userDataPath = path.resolve(envUserData);
    userDataSource = 'env';
  } else if (dotGitFile !== null && isLinkedWorktreeGitFile(dotGitFile, appRoot)) {
    userDataPath = path.join(appRoot, DEV_DATA_DIR);
    userDataSource = 'worktree';
  } else {
    userDataPath = path.join(appDataPath, DEV_APP_DATA_NAME);
    userDataSource = 'dev-default';
  }

  const mockFlag = parseMockFlag(env.NUBES_MOCK_S3);
  const mockGitHubFlag = parseMockFlag(env.NUBES_MOCK_GITHUB);

  return {
    userDataPath,
    userDataSource,
    mockS3: mockFlag ?? true,
    mockS3Source: mockFlag === null ? 'dev-default' : 'env',
    mockGitHub: mockGitHubFlag ?? true,
    mockGitHubSource: mockGitHubFlag === null ? 'dev-default' : 'env',
    background: env.NUBES_BACKGROUND === '1',
  };
}
