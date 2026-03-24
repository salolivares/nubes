import { ipcRenderer } from 'electron';

import {
  DEBUG_CLEAR_DB,
  DEBUG_COPY_TO_CLIPBOARD,
  DEBUG_GET_DB_PATH,
  DEBUG_GET_MOCK_S3_PATH,
  DEBUG_IS_MOCK_S3,
  DEBUG_OPEN_MOCK_S3_PATH,
  DEBUG_SET_MOCK_S3,
} from '@/common';

const setMockS3 = (enabled: boolean) => ipcRenderer.invoke(DEBUG_SET_MOCK_S3, enabled);
const isMockS3 = () => ipcRenderer.invoke(DEBUG_IS_MOCK_S3) as Promise<boolean>;
const getMockS3Path = () => ipcRenderer.invoke(DEBUG_GET_MOCK_S3_PATH) as Promise<string>;
const openMockS3Path = () => ipcRenderer.invoke(DEBUG_OPEN_MOCK_S3_PATH);
const clearDb = () => ipcRenderer.invoke(DEBUG_CLEAR_DB) as Promise<void>;
const getDbPath = () => ipcRenderer.invoke(DEBUG_GET_DB_PATH) as Promise<string>;
const copyToClipboard = (text: string) => ipcRenderer.invoke(DEBUG_COPY_TO_CLIPBOARD, text) as Promise<void>;

export const debug: DebugContext = {
  setMockS3,
  isMockS3,
  getMockS3Path,
  openMockS3Path,
  clearDb,
  getDbPath,
  copyToClipboard,
};
