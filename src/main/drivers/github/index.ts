import path from 'node:path';

import { app } from 'electron';

import {
  DEFAULT_GITHUB_BASE_BRANCH,
  DEFAULT_GITHUB_REPO,
  GITHUB_BASE_BRANCH,
  GITHUB_REPO,
  GITHUB_TOKEN,
} from '@/common/constants';

import { Storage } from '../storage';
import { GitHub } from './github';
import type { GitHubConfig, IGitHubProvider } from './github-provider';
import { MOCK_GITHUB_DIR, MockGitHub } from './mock-github';

export { GitHub } from './github';
export type { AlbumPublication, GitHubConfig, IGitHubProvider } from './github-provider';
export { albumBranch, GitHubError } from './github-provider';
export { MOCK_GITHUB_DIR, MockGitHub } from './mock-github';

/** The saved GitHub settings, with defaults for the repo and base branch. Main only. */
export function readGitHubConfig(): GitHubConfig {
  const storage = Storage.instance;
  return {
    token: storage.secureRead(GITHUB_TOKEN),
    repo: storage.read(GITHUB_REPO) || DEFAULT_GITHUB_REPO,
    baseBranch: storage.read(GITHUB_BASE_BRANCH) || DEFAULT_GITHUB_BASE_BRANCH,
  };
}

export function getMockGitHubPath(): string {
  return path.join(app.getPath('userData'), MOCK_GITHUB_DIR);
}

let currentProvider: IGitHubProvider | null = null;

/**
 * The real GitHub driver unless `src/main/index.ts` picked the mock at startup. Dev picks the mock
 * unless `NUBES_MOCK_GITHUB=0`, so dev never opens a real PR by default.
 */
export function getGitHubProvider(): IGitHubProvider {
  currentProvider ??= new GitHub({
    fetch: (...args) => fetch(...args),
    getConfig: readGitHubConfig,
  });
  return currentProvider;
}

export function setGitHubProvider(provider: IGitHubProvider): void {
  currentProvider = provider;
}

export function enableMockGitHub(): void {
  setGitHubProvider(new MockGitHub(getMockGitHubPath(), readGitHubConfig));
}
