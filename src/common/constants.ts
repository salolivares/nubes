export const SECURE_STORAGE_WRITE = 'secure-storage:write';
export const STORAGE_READ = 'storage:read';
export const STORAGE_WRITE = 'storage:write';
export const STORAGE_CHANNEL = 'storage';
export const STORAGE_CHANGE = 'storage:change';
export const CREDENTIALS_STATUS_CHANNEL = 'storage:credentials-status';
export const CREDENTIALS_CHANGE = 'storage:credentials-change';

export const CONFIG_FILE = 'config.json';
export const DB_FILENAME = 'nubes.db';
export const MIGRATIONS_FOLDER = 'migrations';
export const MIGRATIONS_DEV_PATH = 'src/common/db/migrations';

export const ACCESS_KEY_ID = 'accessKeyId';
export const SECRET_ACCESS_KEY = 'secretAccessKey';
export const AWS_REGION = 'awsRegion';
/** Fine-grained GitHub token for the site repo. Encrypted like the AWS secret. */
export const GITHUB_TOKEN = 'githubToken';
/** `owner/name` of the site repo that album PRs go to. */
export const GITHUB_REPO = 'githubRepo';
/** Branch album PRs start from and merge into. */
export const GITHUB_BASE_BRANCH = 'githubBaseBranch';
export const DEFAULT_GITHUB_REPO = 'salolivares/salolivares.com';
export const DEFAULT_GITHUB_BASE_BRANCH = 'master';
/** Folder in the site repo that holds one JSON file per album. */
export const SITE_ALBUMS_DIR = 'src/content/travel';
/**
 * Keys stored encrypted with safeStorage. The renderer can write them but never read them back.
 */
export const SECURE_STORAGE_KEYS = [ACCESS_KEY_ID, SECRET_ACCESS_KEY, GITHUB_TOKEN] as const;
export const DEFAULT_AWS_REGION = 'us-east-1';

export const THEME_MODE_CURRENT_CHANNEL = 'theme-mode:current';
export const THEME_MODE_TOGGLE_CHANNEL = 'theme-mode:toggle';
export const THEME_MODE_DARK_CHANNEL = 'theme-mode:dark';
export const THEME_MODE_LIGHT_CHANNEL = 'theme-mode:light';
export const THEME_MODE_SYSTEM_CHANNEL = 'theme-mode:system';

export const DEBUG_CHANNEL = 'debug';
export const DEBUG_SET_MOCK_S3 = `${DEBUG_CHANNEL}:setMockS3`;
export const DEBUG_IS_MOCK_S3 = `${DEBUG_CHANNEL}:isMockS3`;
export const DEBUG_GET_MOCK_S3_PATH = `${DEBUG_CHANNEL}:getMockS3Path`;
export const DEBUG_OPEN_MOCK_S3_PATH = `${DEBUG_CHANNEL}:openMockS3Path`;
export const DEBUG_CLEAR_DB = `${DEBUG_CHANNEL}:clearDb`;
export const DEBUG_GET_DB_PATH = `${DEBUG_CHANNEL}:getDbPath`;
export const DEBUG_COPY_TO_CLIPBOARD = `${DEBUG_CHANNEL}:copyToClipboard`;
export const DEBUG_KILL_IMAGE_WORKER = `${DEBUG_CHANNEL}:killImageWorker`;

export const IMAGE_PICKER_CHANNEL = 'image-picker';
export const IMAGE_PICKER_OPEN = `${IMAGE_PICKER_CHANNEL}:open`;
export const IMAGE_PICKER_ALLOW_DROPPED = `${IMAGE_PICKER_CHANNEL}:allow-dropped`;

export const CAMERAS_STORAGE_KEY = 'cameras';
export const CAMERA_SORT_MODE_KEY = 'cameraSortMode';

export const PHOTOSET_CHANNEL = 'photoset';
export const PHOTOSET_LIST = `${PHOTOSET_CHANNEL}:list`;
export const PHOTOSET_GET = `${PHOTOSET_CHANNEL}:get`;
export const PHOTOSET_CREATE = `${PHOTOSET_CHANNEL}:create`;
export const PHOTOSET_UPDATE = `${PHOTOSET_CHANNEL}:update`;
export const PHOTOSET_DELETE = `${PHOTOSET_CHANNEL}:delete`;
export const PHOTOSET_ADD_IMAGES = `${PHOTOSET_CHANNEL}:addImages`;
export const PHOTOSET_PUBLISH = `${PHOTOSET_CHANNEL}:publish`;
export const PHOTOSET_MARK_UPLOADED = `${PHOTOSET_CHANNEL}:markUploaded`;
export const PHOTOSET_SHOW_IN_FOLDER = `${PHOTOSET_CHANNEL}:showInFolder`;
export const PHOTOSET_REMOVE_FILES = `${PHOTOSET_CHANNEL}:removeFiles`;

export const PHOTOSETS_DIR = 'photosets';

export const CACHE_CHANNEL = 'cache';
export const CACHE_GET_USAGE = `${CACHE_CHANNEL}:getUsage`;

export const S3_CHANNEL = 's3';
export const S3_LIST_BUCKETS = `${S3_CHANNEL}:listBuckets`;
export const S3_CREATE_ALBUM = `${S3_CHANNEL}:createAlbum`;
export const S3_IS_MOCK = `${S3_CHANNEL}:isMock`;

export const GITHUB_CHANNEL = 'github';
export const GITHUB_SETTINGS = `${GITHUB_CHANNEL}:settings`;
export const GITHUB_SAVE_SETTINGS = `${GITHUB_CHANNEL}:saveSettings`;
export const GITHUB_CLEAR_TOKEN = `${GITHUB_CHANNEL}:clearToken`;
export const GITHUB_TEST_CONNECTION = `${GITHUB_CHANNEL}:testConnection`;
export const GITHUB_OPEN_PULL_REQUEST = `${GITHUB_CHANNEL}:openPullRequest`;

export const IMAGE_PROCESSOR_CHANNEL = 'image-processor';
export const IMAGE_PROCESSOR_RESIZE = `${IMAGE_PROCESSOR_CHANNEL}:resize`;
export const IMAGE_PROCESSOR_CANCEL = `${IMAGE_PROCESSOR_CHANNEL}:cancel`;
export const IMAGE_PROCESSOR_GET_JOB = `${IMAGE_PROCESSOR_CHANNEL}:getJob`;
export const IMAGE_PROCESSOR_EVENT = `${IMAGE_PROCESSOR_CHANNEL}:event`;
export const THEME_SOURCE_STORAGE_KEY = 'themeSource';
export const WINDOW_STATE_STORAGE_KEY = 'windowState';
