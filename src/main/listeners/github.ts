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

/** The tail of each album's publish queue, by album id. */
const albumQueues = new Map<string, Promise<unknown>>();

/**
 * Run publishes for the same album one after another. Two photosets can share an album id (same
 * year and location) with different JSON, so a second call must not join the first: it runs after
 * it, sees the branch and PR the first one made, and records its own result.
 */
function serializeByAlbum<T>(albumKey: string, task: () => Promise<T>): Promise<T> {
  const previous = albumQueues.get(albumKey) ?? Promise.resolve();
  const next = previous.then(task, task);
  const tail = next.catch(() => undefined);
  albumQueues.set(albumKey, tail);
  void tail.then(() => {
    if (albumQueues.get(albumKey) === tail) albumQueues.delete(albumKey);
  });
  return next;
}

function asResult(err: unknown): GitHubOpenPullRequestResult {
  if (err instanceof GitHubError || err instanceof AlbumMetadataError) {
    return { ok: false, error: err.message };
  }
  throw err;
}

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
  let key: string;
  try {
    key = (await albumPublicationFor(db, photosetId)).albumId;
  } catch (err) {
    return asResult(err);
  }

  return serializeByAlbum(key, async () => {
    try {
      // Read the row again inside the queue, so a publish that waited sends the latest JSON.
      const album = await albumPublicationFor(db, photosetId);
      const pullRequest = await provider.publishAlbum(album);
      db.update(photosets)
        .set({ pullRequestUrl: pullRequest.url, updatedAt: new Date().toISOString() })
        .where(eq(photosets.id, photosetId))
        .run();
      return { ok: true, pullRequest } as const;
    } catch (err) {
      return asResult(err);
    }
  });
}

export function addGitHubEventListeners() {
  handle(GITHUB_SETTINGS, () => getGitHubSettings());

  handle(GITHUB_SAVE_SETTINGS, githubSaveSettingsArgsSchema, (_, args) => {
    const storage = Storage.instance;
    if (args.token) {
      // Without the OS keychain, Storage falls back to base64, which anyone who can read
      // config.json can undo. A write token for the site repo doesn't get that fallback.
      if (!storage.canEncrypt) {
        throw new Error(
          "Can't save the GitHub token: the system keychain isn't available to encrypt it.",
        );
      }
      storage.secureWrite(GITHUB_TOKEN, args.token);
    }
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
