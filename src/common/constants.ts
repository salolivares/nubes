export const SECURE_STORAGE_WRITE = 'secure-storage:write';
export const SECURE_STORAGE_READ = 'secure-storage:read';
export const STORAGE_READ = 'storage:read';
export const STORAGE_WRITE = 'storage:write';
export const STORAGE_CHANNEL = 'storage';
export const STORAGE_CHANGE = 'storage:change';

export const CONFIG_FILE = 'config.json';

export const ACCESS_KEY_ID = 'accessKeyId';
export const SECRET_ACCESS_KEY = 'secretAccessKey';
export const AWS_REGION = 'awsRegion';
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

export const IMAGE_PICKER_CHANNEL = 'image-picker';
export const IMAGE_PICKER_OPEN = `${IMAGE_PICKER_CHANNEL}:open`;
export const IMAGE_PICKER_READ_THUMBNAIL = `${IMAGE_PICKER_CHANNEL}:read-thumbnail`;

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

export const IMAGE_PROCESSOR_CHANNEL = 'image-processor';
export const IMAGE_PROCESSOR_RESIZE = `${IMAGE_PROCESSOR_CHANNEL}:resize`;
export const IMAGE_PROCESSOR_PROGRESS = `${IMAGE_PROCESSOR_CHANNEL}:progress`;
export const IMAGE_PROCESSOR_COMPLETE = `${IMAGE_PROCESSOR_CHANNEL}:complete`;
export const IMAGE_PROCESSOR_ERROR = `${IMAGE_PROCESSOR_CHANNEL}:error`;
