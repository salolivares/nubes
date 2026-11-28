import baseLog from 'electron-log/main';

import { SITE_ALBUMS_DIR } from '@/common/constants';
import type { GitHubConnectionResult, GitHubPullRequest } from '@/common/types';

import type { AlbumPublication, GitHubConfig, IGitHubProvider } from './github-provider';
import { albumBranch, GitHubError } from './github-provider';

const log = baseLog.scope('GitHub');

const API = 'https://api.github.com';
const API_VERSION = '2022-11-28';

/**
 * A ref that can never exist: git refuses `..` in branch names. Used to probe write access with
 * requests GitHub must reject after its permission check, so nothing is ever created.
 */
const PROBE_HEAD = 'nubes-permission-probe..never';
const ZERO_SHA = '0000000000000000000000000000000000000000';

/** The permission names as GitHub's fine-grained token settings show them. */
const PERMISSION = {
  contentsWrite: 'Contents: Read and write',
  pullsRead: 'Pull requests: Read',
  pullsWrite: 'Pull requests: Read and write',
} as const;

export interface GitHubDeps {
  fetch: typeof fetch;
  getConfig: () => GitHubConfig;
}

interface Response<T> {
  status: number;
  data: T;
  headers: Headers;
}

interface ApiError {
  message?: string;
  errors?: { message?: string; code?: string; field?: string }[];
}

interface ContentFile {
  sha: string;
  content?: string;
  encoding?: string;
}

interface PullRequestJson {
  number: number;
  html_url: string;
}

function messageOf(data: unknown): string {
  const err = data as ApiError | null;
  const parts = [err?.message, ...(err?.errors ?? []).map((e) => e.message ?? e.code)];
  return parts.filter(Boolean).join(' ');
}

/** The REST path for a file in the repo. Each segment is encoded, the slashes kept. */
function contentsPath(repo: string, filePath: string): string {
  return `/repos/${repo}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Opens album PRs on the site repo with the REST API and plain `fetch`. Every request logs only its
 * method, path and status: never headers (they hold the token) or bodies.
 */
export class GitHub implements IGitHubProvider {
  readonly mock = false;

  constructor(private readonly deps: GitHubDeps) {}

  private config(): GitHubConfig & { token: string } {
    const config = this.deps.getConfig();
    if (!config.token) {
      throw new GitHubError('No GitHub token saved. Add one in Settings, then try again.');
    }
    return { ...config, token: config.token };
  }

  private async request<T>(
    token: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response<T>> {
    let res: globalThis.Response;
    try {
      res = await this.deps.fetch(`${API}${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': API_VERSION,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      // Network errors carry no request details, but log only the cause's code to be sure.
      const code = (err as { cause?: { code?: string } }).cause?.code ?? (err as Error).name;
      log.warn(`${method} ${path} failed: ${code}`);
      throw new GitHubError(`Couldn't reach GitHub (${code}). Check your connection and retry.`);
    }
    log.info(`${method} ${path} -> ${res.status}`);
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    return { status: res.status, data: data as T, headers: res.headers };
  }

  /**
   * Turn a response GitHub refused into a message the user can act on. `action` says what was being
   * attempted, `permission` which token permission it needs.
   */
  private failure(
    res: Response<unknown>,
    repo: string,
    action: string,
    permission?: string,
  ): GitHubError {
    if (res.status === 401) {
      return new GitHubError(
        'GitHub rejected the token: it is invalid, expired or revoked. Paste a new one in Settings.',
      );
    }
    if (
      (res.status === 403 || res.status === 429) &&
      (res.headers.get('x-ratelimit-remaining') === '0' || res.headers.has('retry-after'))
    ) {
      return new GitHubError('GitHub rate limit reached. Wait a few minutes, then retry.');
    }
    if (res.status === 403) {
      const accepted = res.headers.get('x-accepted-github-permissions');
      const needs = permission ?? (accepted ? `"${accepted}"` : 'more permissions');
      return new GitHubError(
        `The token can't ${action} in ${repo}. Give it ${needs} for that repository.`,
      );
    }
    if (res.status === 404) {
      return new GitHubError(
        `GitHub couldn't find ${repo}, or the token can't see it. Check the repository in ` +
          'Settings, and that the fine-grained token lists it under "Repository access".',
      );
    }
    const detail = messageOf(res.data);
    return new GitHubError(
      `GitHub refused to ${action} (HTTP ${res.status})${detail ? `: ${detail}` : ''}.`,
    );
  }

  async testConnection(): Promise<GitHubConnectionResult> {
    let config;
    try {
      config = this.config();
    } catch (err) {
      return { ok: false, message: (err as Error).message, missingPermissions: [] };
    }
    const { token, repo, baseBranch } = config;
    const get = <T>(path: string) => this.request<T>(token, 'GET', path);
    const fail = (err: GitHubError, missing: string[] = []) => ({
      ok: false,
      message: err.message,
      missingPermissions: missing,
    });

    const repoRes = await get(`/repos/${repo}`);
    if (repoRes.status !== 200) return fail(this.failure(repoRes, repo, 'read the repository'));

    const branchRes = await get(`/repos/${repo}/branches/${encodeURIComponent(baseBranch)}`);
    if (branchRes.status === 404) {
      return fail(new GitHubError(`${repo} has no branch named "${baseBranch}".`));
    }
    if (branchRes.status !== 200) return fail(this.failure(branchRes, repo, 'read branches'));

    const missing: string[] = [];
    const contentsRes = await get(
      `/repos/${repo}/contents/${SITE_ALBUMS_DIR}?ref=${encodeURIComponent(baseBranch)}`,
    );
    if (contentsRes.status === 401) return fail(this.failure(contentsRes, repo, 'read files'));
    if (contentsRes.status === 403) missing.push(PERMISSION.contentsWrite);

    const pullsRes = await get(`/repos/${repo}/pulls?per_page=1`);
    if (pullsRes.status === 403) missing.push(PERMISSION.pullsWrite);

    // Write access can't be read off a fine-grained token, so ask for writes GitHub must reject
    // anyway: 422 means the permission check passed, 403 means it didn't. Neither creates anything.
    if (contentsRes.status !== 403) {
      const refRes = await this.request(token, 'POST', `/repos/${repo}/git/refs`, {
        ref: `refs/heads/${PROBE_HEAD}`,
        sha: ZERO_SHA,
      });
      if (refRes.status === 403 || refRes.status === 404) missing.push(PERMISSION.contentsWrite);
    }
    if (pullsRes.status !== 403) {
      const prRes = await this.request(token, 'POST', `/repos/${repo}/pulls`, {
        title: 'nubes permission probe',
        head: PROBE_HEAD,
        base: baseBranch,
        draft: true,
      });
      if (prRes.status === 403 || prRes.status === 404) missing.push(PERMISSION.pullsWrite);
    }

    if (missing.length > 0) {
      return {
        ok: false,
        message: `The token can read ${repo} but is missing: ${missing.join(', ')}.`,
        missingPermissions: missing,
      };
    }
    if (contentsRes.status === 404) {
      return {
        ok: true,
        message: `Connected to ${repo}, but ${SITE_ALBUMS_DIR} doesn't exist on ${baseBranch} yet.`,
        missingPermissions: [],
      };
    }
    return {
      ok: true,
      message: `Connected to ${repo}. The token can open album PRs against ${baseBranch}.`,
      missingPermissions: [],
    };
  }

  async publishAlbum(album: AlbumPublication): Promise<GitHubPullRequest> {
    const { token, repo, baseBranch } = this.config();
    const branch = albumBranch(album.albumId);
    const filePath = `${SITE_ALBUMS_DIR}/${album.albumId}.json`;
    const req = <T>(method: string, path: string, body?: unknown) =>
      this.request<T>(token, method, path, body);

    // 1. The album branch: reuse it if it exists (a re-upload), otherwise cut it from the base.
    const branchRes = await req<{ object: { sha: string } }>(
      'GET',
      `/repos/${repo}/git/ref/heads/${branch}`,
    );
    if (branchRes.status === 404) {
      const baseRes = await req<{ object: { sha: string } }>(
        'GET',
        `/repos/${repo}/git/ref/heads/${baseBranch}`,
      );
      if (baseRes.status === 404) {
        throw new GitHubError(`${repo} has no branch named "${baseBranch}". Check Settings.`);
      }
      if (baseRes.status !== 200) throw this.failure(baseRes, repo, 'read branches');
      const createRes = await req('POST', `/repos/${repo}/git/refs`, {
        ref: `refs/heads/${branch}`,
        sha: baseRes.data.object.sha,
      });
      // 422 here means another publish of the same album created it first. Use it.
      if (createRes.status !== 201 && createRes.status !== 422) {
        throw this.failure(createRes, repo, 'create a branch', PERMISSION.contentsWrite);
      }
    } else if (branchRes.status !== 200) {
      throw this.failure(branchRes, repo, 'read branches');
    }

    // 2. The file on that branch. Skip the commit when it already matches, so a retry after a
    //    failed PR step doesn't add an empty-looking commit.
    const existed = await this.commitFile(token, repo, branch, filePath, album);

    // 3. The PR: reuse the open one for this branch, or open a draft.
    const [owner] = repo.split('/');
    const existing = await this.findOpenPullRequest(token, repo, `${owner}:${branch}`, baseBranch);
    if (existing)
      return { url: existing.html_url, number: existing.number, created: false, mock: false };

    const verb = existed ? 'Update' : 'Add';
    const prRes = await req<PullRequestJson>('POST', `/repos/${repo}/pulls`, {
      title: `${verb} "${album.title}" travel album`,
      head: branch,
      base: baseBranch,
      draft: true,
      body: [
        `${verb}s \`${filePath}\`.`,
        '',
        `The images are already in the \`${album.bucketName}\` S3 bucket under \`${album.albumId}/\`.`,
        'Check the Vercel preview, then merge to publish.',
        '',
        'Opened by Nubes.',
      ].join('\n'),
    });
    if (prRes.status === 201) {
      return { url: prRes.data.html_url, number: prRes.data.number, created: true, mock: false };
    }
    if (prRes.status === 422) {
      const detail = messageOf(prRes.data);
      // Another publish opened it between the lookup and here.
      if (/already exists/i.test(detail)) {
        const raced = await this.findOpenPullRequest(token, repo, `${owner}:${branch}`, baseBranch);
        if (raced)
          return { url: raced.html_url, number: raced.number, created: false, mock: false };
      }
      if (/no commits between/i.test(detail)) {
        throw new GitHubError(
          `${baseBranch} already has this exact album JSON, so there is nothing to open a PR for.`,
        );
      }
    }
    throw this.failure(prRes, repo, 'open a pull request', PERMISSION.pullsWrite);
  }

  /** Create or update the file on `branch`. Returns whether it existed before. */
  private async commitFile(
    token: string,
    repo: string,
    branch: string,
    filePath: string,
    album: AlbumPublication,
  ): Promise<boolean> {
    const path = contentsPath(repo, filePath);
    const ref = `?ref=${encodeURIComponent(branch)}`;
    const content = Buffer.from(album.content, 'utf8').toString('base64');

    // Two tries: if the file changes between the read and the write (409, or 422 for a missing
    // sha), read it again once.
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = await this.request<ContentFile>(token, 'GET', `${path}${ref}`);
      if (current.status !== 200 && current.status !== 404) {
        throw this.failure(current, repo, 'read files', PERMISSION.contentsWrite);
      }
      const existing = current.status === 200 ? current.data : null;
      if (existing?.content && existing.encoding === 'base64') {
        const onBranch = Buffer.from(existing.content, 'base64').toString('utf8');
        if (onBranch === album.content) return true;
      }

      const put = await this.request(token, 'PUT', path, {
        message: `${existing ? 'Update' : 'Add'} ${album.albumId} travel album`,
        content,
        branch,
        ...(existing ? { sha: existing.sha } : {}),
      });
      if (put.status === 200 || put.status === 201) return existing !== null;
      if ((put.status === 409 || put.status === 422) && attempt === 0) continue;
      throw this.failure(put, repo, 'commit files', PERMISSION.contentsWrite);
    }
    throw new GitHubError(`The album file kept changing on ${branch}. Retry.`);
  }

  private async findOpenPullRequest(
    token: string,
    repo: string,
    head: string,
    base: string,
  ): Promise<PullRequestJson | null> {
    const res = await this.request<PullRequestJson[]>(
      token,
      'GET',
      `/repos/${repo}/pulls?state=open&head=${encodeURIComponent(head)}&base=${encodeURIComponent(base)}`,
    );
    if (res.status !== 200)
      throw this.failure(res, repo, 'list pull requests', PERMISSION.pullsRead);
    return res.data[0] ?? null;
  }
}
