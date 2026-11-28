import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GitHub } from '@/main/drivers/github/github';
import type { AlbumPublication, GitHubConfig } from '@/main/drivers/github/github-provider';
import { GitHubError } from '@/main/drivers/github/github-provider';

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('electron-log/main', () => ({ default: { scope: () => log } }));

const TOKEN = 'github_pat_11ABCDEFG0123456789_secretsecretsecretsecret';
const REPO = 'salolivares/salolivares.com';
const FILE = 'src/content/travel/2024-big-sur.json';
const BRANCH = 'photos/2024-big-sur';

const album: AlbumPublication = {
  albumId: '2024-big-sur',
  title: 'Trip',
  content: '{\n  "title": "Trip"\n}\n',
  bucketName: 'photos',
};

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | undefined;
  headers: Record<string, string>;
}

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };
type Route = (call: Call) => Reply | undefined;

/**
 * A fake api.github.com. Routes are tried in order; the first to return a reply wins. Anything
 * unrouted is a 500, so a test fails loudly on a request it didn't expect.
 */
function fakeFetch(routes: Route[]) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const parsed = new URL(String(url));
    expect(parsed.origin).toBe('https://api.github.com');
    const call: Call = {
      method: init?.method ?? 'GET',
      path: parsed.pathname + parsed.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: init?.headers as Record<string, string>,
    };
    calls.push(call);
    const reply = routes.map((route) => route(call)).find(Boolean) ?? { status: 500 };
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: reply.headers,
    });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

const route =
  (method: string, path: string | RegExp, reply: Reply | ((call: Call) => Reply)): Route =>
  (call) => {
    const matches = typeof path === 'string' ? call.path === path : path.test(call.path);
    if (call.method !== method || !matches) return undefined;
    return typeof reply === 'function' ? reply(call) : reply;
  };

const b64 = (text: string) => Buffer.from(text).toString('base64');

function driver(fetch: typeof globalThis.fetch, config: Partial<GitHubConfig> = {}) {
  return new GitHub({
    fetch,
    getConfig: () => ({ token: TOKEN, repo: REPO, baseBranch: 'master', ...config }),
  });
}

/** Nothing the driver logged or threw may contain the token. */
function expectNoToken(...extra: unknown[]) {
  const everything = JSON.stringify([
    log.info.mock.calls,
    log.warn.mock.calls,
    log.error.mock.calls,
    ...extra.map((e) => (e instanceof Error ? e.message : e)),
  ]);
  expect(everything).not.toContain(TOKEN);
  expect(everything).not.toContain('Bearer');
}

beforeEach(() => {
  log.info.mockClear();
  log.warn.mockClear();
});

describe('GitHub.publishAlbum', () => {
  it('branches from the base, commits the file and opens a draft PR', async () => {
    const { fetch, calls } = fakeFetch([
      route('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`, { status: 404 }),
      route('GET', `/repos/${REPO}/git/ref/heads/master`, {
        status: 200,
        body: { object: { sha: 'base-sha' } },
      }),
      route('POST', `/repos/${REPO}/git/refs`, { status: 201, body: {} }),
      route('GET', new RegExp(`/contents/${FILE}\\?ref=`), { status: 404 }),
      route('PUT', `/repos/${REPO}/contents/${FILE}`, { status: 201, body: {} }),
      route('GET', /\/pulls\?state=open/, { status: 200, body: [] }),
      route('POST', `/repos/${REPO}/pulls`, {
        status: 201,
        body: { number: 12, html_url: `https://github.com/${REPO}/pull/12` },
      }),
    ]);

    const pr = await driver(fetch).publishAlbum(album);

    expect(pr).toEqual({
      url: `https://github.com/${REPO}/pull/12`,
      number: 12,
      created: true,
      mock: false,
    });
    expect(calls.find((c) => c.method === 'POST' && c.path.endsWith('/git/refs'))?.body).toEqual({
      ref: `refs/heads/${BRANCH}`,
      sha: 'base-sha',
    });
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.body).toEqual({
      message: 'Add 2024-big-sur travel album',
      content: b64(album.content),
      branch: BRANCH,
    });
    const open = calls.find((c) => c.method === 'POST' && c.path.endsWith('/pulls'))!;
    expect(open.body).toMatchObject({ head: BRANCH, base: 'master', draft: true });
    expect(calls.find((c) => c.path.includes('state=open'))?.path).toContain(
      `head=${encodeURIComponent(`salolivares:${BRANCH}`)}`,
    );
    // Every request authenticates, and none of it reaches the logs.
    for (const call of calls) expect(call.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expectNoToken();
  });

  it('updates the file on an existing branch and reuses its open PR', async () => {
    const { fetch, calls } = fakeFetch([
      route('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`, {
        status: 200,
        body: { object: { sha: 'branch-sha' } },
      }),
      route('GET', new RegExp(`/contents/${FILE}\\?ref=`), {
        status: 200,
        body: { sha: 'file-sha', encoding: 'base64', content: b64('{"old":true}\n') },
      }),
      route('PUT', `/repos/${REPO}/contents/${FILE}`, { status: 200, body: {} }),
      route('GET', /\/pulls\?state=open/, {
        status: 200,
        body: [{ number: 4, html_url: `https://github.com/${REPO}/pull/4` }],
      }),
    ]);

    const pr = await driver(fetch).publishAlbum(album);

    expect(pr).toMatchObject({ number: 4, created: false });
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({
      message: 'Update 2024-big-sur travel album',
      sha: 'file-sha',
      branch: BRANCH,
    });
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('skips the commit when the branch already has the same file', async () => {
    const { fetch, calls } = fakeFetch([
      route('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`, {
        status: 200,
        body: { object: { sha: 'branch-sha' } },
      }),
      route('GET', new RegExp(`/contents/${FILE}\\?ref=`), {
        status: 200,
        // GitHub wraps base64 at 60 characters.
        body: {
          sha: 'file-sha',
          encoding: 'base64',
          content: b64(album.content).replace(/(.{20})/g, '$1\n'),
        },
      }),
      route('GET', /\/pulls\?state=open/, { status: 200, body: [] }),
      // Left over from a PR closed without merging: it has a commit of its own, so it's kept.
      route('GET', `/repos/${REPO}/compare/master...${BRANCH}`, {
        status: 200,
        body: { ahead_by: 1 },
      }),
      route('POST', `/repos/${REPO}/pulls`, {
        status: 201,
        body: { number: 5, html_url: `https://github.com/${REPO}/pull/5` },
      }),
    ]);

    const pr = await driver(fetch).publishAlbum(album);

    expect(pr).toMatchObject({ number: 5, created: true });
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    // The file was already on the branch, so the PR says "Update".
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      title: 'Update "Trip" travel album',
    });
  });

  it('moves a branch left over from a merged PR to the base before committing', async () => {
    let branchSha = 'old-merged-sha';
    const { fetch, calls } = fakeFetch([
      route('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`, {
        status: 200,
        body: { object: { sha: 'old-merged-sha' } },
      }),
      route('GET', `/repos/${REPO}/git/ref/heads/master`, {
        status: 200,
        body: { object: { sha: 'base-sha' } },
      }),
      route('GET', /\/pulls\?state=open/, { status: 200, body: [] }),
      route('GET', `/repos/${REPO}/compare/master...${BRANCH}`, {
        status: 200,
        body: { ahead_by: 0 },
      }),
      route('PATCH', `/repos/${REPO}/git/refs/heads/${BRANCH}`, (call) => {
        branchSha = call.body!.sha as string;
        return { status: 200, body: {} };
      }),
      // After the move, the branch has what master has: the JSON as Pages CMS left it.
      route('GET', new RegExp(`/contents/${FILE}\\?ref=`), () => ({
        status: 200,
        body: {
          sha: branchSha === 'base-sha' ? 'cms-sha' : 'stale-sha',
          encoding: 'base64',
          content: b64(branchSha === 'base-sha' ? '{"edited":"in cms"}\n' : album.content),
        },
      })),
      route('PUT', `/repos/${REPO}/contents/${FILE}`, { status: 200, body: {} }),
      route('POST', `/repos/${REPO}/pulls`, {
        status: 201,
        body: { number: 9, html_url: `https://github.com/${REPO}/pull/9` },
      }),
    ]);

    const pr = await driver(fetch).publishAlbum(album);

    expect(pr).toMatchObject({ number: 9, created: true });
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ sha: 'base-sha', force: true });
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ sha: 'cms-sha' });
  });

  it('fails on a 422 from branch creation when the branch still is not there', async () => {
    const { fetch, calls } = fakeFetch([
      route('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`, { status: 404 }),
      route('GET', `/repos/${REPO}/git/ref/heads/master`, {
        status: 200,
        body: { object: { sha: 'base-sha' } },
      }),
      route('POST', `/repos/${REPO}/git/refs`, {
        status: 422,
        body: { message: 'Reference update failed' },
      }),
    ]);

    await expect(driver(fetch).publishAlbum(album)).rejects.toThrow(
      /refused to create a branch \(HTTP 422\): Reference update failed/,
    );
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('rereads the file once when it changed under the commit', async () => {
    let puts = 0;
    const { fetch } = fakeFetch([
      route('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`, {
        status: 200,
        body: { object: { sha: 'x' } },
      }),
      route('GET', new RegExp(`/contents/${FILE}\\?ref=`), { status: 404 }),
      route('PUT', `/repos/${REPO}/contents/${FILE}`, () =>
        ++puts === 1 ? { status: 409, body: { message: 'conflict' } } : { status: 201, body: {} },
      ),
      route('GET', /\/pulls\?state=open/, {
        status: 200,
        body: [{ number: 1, html_url: `https://github.com/${REPO}/pull/1` }],
      }),
    ]);

    await expect(driver(fetch).publishAlbum(album)).resolves.toMatchObject({ number: 1 });
    expect(puts).toBe(2);
  });

  it.each([
    [401, {}, /invalid, expired or revoked/],
    [403, {}, /can't create a branch in salolivares\/salolivares\.com.*Contents: Read and write/],
    [403, { 'x-ratelimit-remaining': '0' }, /rate limit/],
    [404, {}, /couldn't find salolivares\/salolivares\.com, or the token can't see it/],
  ] as const)('explains a %i without leaking the token', async (status, headers, message) => {
    const { fetch } = fakeFetch([
      route('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`, { status: 404 }),
      route('GET', `/repos/${REPO}/git/ref/heads/master`, {
        status: 200,
        body: { object: { sha: 'base-sha' } },
      }),
      route('POST', `/repos/${REPO}/git/refs`, {
        status,
        headers,
        body: { message: `echo ${TOKEN}` },
      }),
    ]);

    const err = await driver(fetch)
      .publishAlbum(album)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(GitHubError);
    expect((err as Error).message).toMatch(message);
    expectNoToken(err);
  });

  it('fails without a request when no token is saved', async () => {
    const { fetch } = fakeFetch([]);
    await expect(driver(fetch, { token: null }).publishAlbum(album)).rejects.toThrow(
      /No GitHub token saved/,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports an unreachable GitHub as a GitHubError', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }),
      );
    await expect(driver(fetch).publishAlbum(album)).rejects.toThrow(
      /Couldn't reach GitHub \(ENOTFOUND\)/,
    );
    expectNoToken();
  });
});

describe('GitHub.testConnection', () => {
  const readable = [
    route('GET', `/repos/${REPO}`, { status: 200, body: {} }),
    route('GET', `/repos/${REPO}/branches/master`, { status: 200, body: {} }),
    route('GET', /\/contents\/src\/content\/travel\?ref=master$/, { status: 200, body: [] }),
    route('GET', `/repos/${REPO}/pulls?per_page=1`, { status: 200, body: [] }),
  ];

  it('passes when both write probes get past the permission check', async () => {
    const { fetch, calls } = fakeFetch([
      ...readable,
      route('POST', `/repos/${REPO}/git/refs`, { status: 422, body: {} }),
      route('POST', `/repos/${REPO}/pulls`, { status: 422, body: {} }),
    ]);

    const result = await driver(fetch).testConnection();

    expect(result).toEqual({
      ok: true,
      message: expect.stringContaining('can open album PRs against master'),
      missingPermissions: [],
    });
    // The probes name refs git can't create, so they can never make a branch or a PR.
    for (const probe of calls.filter((c) => c.method === 'POST')) {
      expect(JSON.stringify(probe.body)).toContain('..');
    }
  });

  it('names each missing write permission', async () => {
    const { fetch } = fakeFetch([
      ...readable,
      route('POST', `/repos/${REPO}/git/refs`, { status: 403, body: {} }),
      route('POST', `/repos/${REPO}/pulls`, { status: 403, body: {} }),
    ]);

    const result = await driver(fetch).testConnection();

    expect(result.ok).toBe(false);
    expect(result.missingPermissions).toEqual([
      'Contents: Read and write',
      'Pull requests: Read and write',
    ]);
  });

  it.each([
    [401, /invalid, expired or revoked/],
    [404, /couldn't find .* or the token can't see it/],
  ] as const)('explains a %i on the repo', async (status, message) => {
    const { fetch } = fakeFetch([route('GET', `/repos/${REPO}`, { status })]);
    const result = await driver(fetch).testConnection();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(message);
    expectNoToken(result);
  });

  it('reports a missing base branch', async () => {
    const { fetch } = fakeFetch([
      route('GET', `/repos/${REPO}`, { status: 200, body: {} }),
      route('GET', `/repos/${REPO}/branches/main`, { status: 404 }),
    ]);
    const result = await driver(fetch, { baseBranch: 'main' }).testConnection();
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('"main"') });
  });

  it('reports a missing token without a request', async () => {
    const { fetch } = fakeFetch([]);
    const result = await driver(fetch, { token: null }).testConnection();
    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
