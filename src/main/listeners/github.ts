import { eq } from 'drizzle-orm';

import {
  albumId,
  AlbumMetadataError,
  buildAlbumMetadata,
  serializeAlbumMetadata,
} from '@/common/album-metadata';
import {
  GITHUB_BASE_BRANCH,
  GITHUB_CLEAR_TOKEN,
  GITHUB_OPEN_PULL_REQUEST,
  GITHUB_REPO,
  GITHUB_SAVE_SETTINGS,
  GITHUB_SETTINGS,
  GITHUB_TEST_CONNECTION,
  GITHUB_TOKEN,
} from '@/common/constants';
import { photosets } from '@/common/db/schema';
import type { GitHubOpenPullRequestResult, GitHubSettings } from '@/common/types';
import { githubOpenPullRequestArgsSchema, githubSaveSettingsArgsSchema } from '@/common/types';
import { Database } from '@/main/drivers/database';
import type { AlbumPublication, IGitHubProvider } from '@/main/drivers/github';
import { getGitHubProvider, GitHubError, readGitHubConfig } from '@/main/drivers/github';
import { Storage } from '@/main/drivers/storage';
import { handle } from '@/main/ipc';

/** The renderer's view of the GitHub settings. Never includes the token. */
export function getGitHubSettings(): GitHubSettings {
  const { token, repo, baseBranch } = readGitHubConfig();
  return { hasToken: token !== null, repo, baseBranch, mock: getGitHubProvider().mock };
}

type Db = typeof Database.instance.db;

/** Build the album JSON from what the DB recorded at upload. Throws when it can't be published. */
export async function albumPublicationFor(db: Db, photosetId: number): Promise<AlbumPublication> {
  const photoset = await db.query.photosets.findFirst({
    where: eq(photosets.id, photosetId),
    with: {
      images: {
        columns: { name: true, camera: true },
        orderBy: (images, { asc }) => [asc(images.sortOrder)],
      },
    },
  });
  if (!photoset) throw new GitHubError(`Photoset ${photosetId} not found.`);
  if (!photoset.uploadedAt) {
    throw new GitHubError('Upload the images to S3 before opening a PR for the album.');
  }
  // Throws a readable AlbumMetadataError when the album would break the site build.
  const metadata = buildAlbumMetadata(
    { ...photoset, published: photoset.status === 'published' },
    photoset.images,
  );
  return {
    albumId: albumId(photoset),
    title: photoset.name,
    content: serializeAlbumMetadata(metadata),
    bucketName: photoset.bucketName,
  };
}

/** Publishes in flight, by album id. A second click joins the first instead of racing it. */
const inFlight = new Map<string, Promise<GitHubOpenPullRequestResult>>();

/**
 * Commit the album JSON and open (or reuse) its draft PR, then record the URL on the photoset.
 * GitHub problems come back as `{ ok: false, error }` and leave the S3 upload alone, so the user
 * can retry just this step.
 */
export async function openAlbumPullRequest(
  db: Db,
  provider: IGitHubProvider,
  photosetId: number,
): Promise<GitHubOpenPullRequestResult> {
  let album: AlbumPublication;
  try {
    album = await albumPublicationFor(db, photosetId);
  } catch (err) {
    if (err instanceof GitHubError || err instanceof AlbumMetadataError)
      return { ok: false, error: err.message };
    throw err;
  }

  const running = inFlight.get(album.albumId);
  if (running) return running;

  const run = (async (): Promise<GitHubOpenPullRequestResult> => {
    try {
      const pullRequest = await provider.publishAlbum(album);
      db.update(photosets)
        .set({ pullRequestUrl: pullRequest.url, updatedAt: new Date().toISOString() })
        .where(eq(photosets.id, photosetId))
        .run();
      return { ok: true, pullRequest };
    } catch (err) {
      if (err instanceof GitHubError) return { ok: false, error: err.message };
      throw err;
    }
  })();
  inFlight.set(album.albumId, run);
  try {
    return await run;
  } finally {
    inFlight.delete(album.albumId);
  }
}

export function addGitHubEventListeners() {
  handle(GITHUB_SETTINGS, () => getGitHubSettings());

  handle(GITHUB_SAVE_SETTINGS, githubSaveSettingsArgsSchema, (_, args) => {
    const storage = Storage.instance;
    if (args.token) storage.secureWrite(GITHUB_TOKEN, args.token);
    storage.write(GITHUB_REPO, args.repo);
    storage.write(GITHUB_BASE_BRANCH, args.baseBranch);
    return getGitHubSettings();
  });

  handle(GITHUB_CLEAR_TOKEN, () => {
    Storage.instance.secureDelete(GITHUB_TOKEN);
    return getGitHubSettings();
  });

  handle(GITHUB_TEST_CONNECTION, () => getGitHubProvider().testConnection());

  handle(GITHUB_OPEN_PULL_REQUEST, githubOpenPullRequestArgsSchema, (_, { photosetId }) =>
    openAlbumPullRequest(Database.instance.db, getGitHubProvider(), photosetId),
  );
}
