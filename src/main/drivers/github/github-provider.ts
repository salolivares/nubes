import type { GitHubConnectionResult, GitHubPullRequest } from '@/common/types';

/** Where album PRs go, and the token that opens them. Read fresh from Storage on every call. */
export interface GitHubConfig {
  token: string | null;
  /** `owner/name` */
  repo: string;
  baseBranch: string;
}

/** One album's JSON, ready to commit to the site repo. */
export interface AlbumPublication {
  /** `{year}-{slug(location)}`. Names the branch (`photos/{albumId}`) and the file. */
  albumId: string;
  /** The album's title, for the PR title and body. */
  title: string;
  /** The file's full contents. */
  content: string;
  /** S3 bucket holding the images, mentioned in the PR body. */
  bucketName: string;
}

/**
 * A failure the user can act on: bad token, missing permission, repo or branch not found. The
 * message is shown as is, so it must never include the token, request headers or a response body.
 */
export class GitHubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubError';
  }
}

export interface IGitHubProvider {
  /** True for the local mock, which never talks to github.com. */
  readonly mock: boolean;
  /** Check the token can reach the repo and has every permission the PR step needs. */
  testConnection(): Promise<GitHubConnectionResult>;
  /**
   * Commit the album JSON to `photos/{albumId}` and open a draft PR, or reuse the open one. Safe to
   * call again for the same album: it updates the file on the existing branch. Throws
   * `GitHubError` for problems the user can fix.
   */
  publishAlbum(album: AlbumPublication): Promise<GitHubPullRequest>;
}

/** The branch an album's PR comes from. */
export function albumBranch(albumId: string): string {
  return `photos/${albumId}`;
}
