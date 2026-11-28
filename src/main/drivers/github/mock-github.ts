import fsp from 'node:fs/promises';
import path from 'node:path';

import { SITE_ALBUMS_DIR } from '@/common/constants';
import type { GitHubConnectionResult, GitHubPullRequest } from '@/common/types';

import type { AlbumPublication, GitHubConfig, IGitHubProvider } from './github-provider';
import { albumBranch } from './github-provider';

export const MOCK_GITHUB_DIR = 'mock-github';

interface MockPullRequest {
  number: number;
  head: string;
  base: string;
  url: string;
}

interface MockState {
  /** Branch name to `{ file path: contents }`. */
  branches: Record<string, Record<string, string>>;
  pulls: MockPullRequest[];
}

/**
 * Stands in for GitHub in dev, the way MockS3 stands in for S3. It never makes a network request
 * and needs no token. Branches, files and PRs live in `state.json` under `root`, and each
 * committed album is also written out under `<root>/<owner>/<name>/<branch>/` to inspect.
 *
 * Its PR URLs point at `https://github.com/<repo>/pull/mock-<n>`, which is a 404 on GitHub, so a
 * click can never land on a real PR.
 */
export class MockGitHub implements IGitHubProvider {
  readonly mock = true;
  /** Publishes run one at a time, so two albums can't read the same state and overwrite it. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly root: string,
    private readonly getConfig: () => GitHubConfig,
  ) {}

  private statePath() {
    return path.join(this.root, 'state.json');
  }

  async readState(): Promise<MockState> {
    try {
      return JSON.parse(await fsp.readFile(this.statePath(), 'utf8')) as MockState;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { branches: {}, pulls: [] };
      throw err;
    }
  }

  private async writeState(state: MockState) {
    await fsp.mkdir(this.root, { recursive: true });
    // Write then rename, so a crash mid-write never leaves half a state file.
    const tmp = `${this.statePath()}.tmp`;
    await fsp.writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`);
    await fsp.rename(tmp, this.statePath());
  }

  async testConnection(): Promise<GitHubConnectionResult> {
    const { repo, baseBranch } = this.getConfig();
    return {
      ok: true,
      message: `Mock GitHub: nothing was sent. PRs for ${repo} (${baseBranch}) stay on this machine.`,
      missingPermissions: [],
    };
  }

  publishAlbum(album: AlbumPublication): Promise<GitHubPullRequest> {
    const run = this.queue.then(
      () => this.publishNow(album),
      () => this.publishNow(album),
    );
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async publishNow(album: AlbumPublication): Promise<GitHubPullRequest> {
    const { repo, baseBranch } = this.getConfig();
    const branch = albumBranch(album.albumId);
    const filePath = `${SITE_ALBUMS_DIR}/${album.albumId}.json`;
    const state = await this.readState();

    state.branches[branch] ??= { ...(state.branches[baseBranch] ?? {}) };
    state.branches[branch][filePath] = album.content;

    const outFile = path.join(this.root, ...repo.split('/'), ...branch.split('/'), filePath);
    await fsp.mkdir(path.dirname(outFile), { recursive: true });
    await fsp.writeFile(outFile, album.content);

    const open = state.pulls.find((pr) => pr.head === branch && pr.base === baseBranch);
    if (open) {
      await this.writeState(state);
      return { url: open.url, number: open.number, created: false, mock: true };
    }

    const number = state.pulls.length + 1;
    const pr = {
      number,
      head: branch,
      base: baseBranch,
      url: `https://github.com/${repo}/pull/mock-${number}`,
    };
    state.pulls.push(pr);
    await this.writeState(state);
    console.log(`[MockGitHub] Opened draft PR #${number} for ${branch}: ${outFile}`);
    return { url: pr.url, number, created: true, mock: true };
  }
}
