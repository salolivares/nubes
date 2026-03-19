import { ipcRenderer } from 'electron';

import {
  DEBUG_GET_MOCK_S3_PATH,
  DEBUG_IS_MOCK_S3,
  DEBUG_OPEN_MOCK_S3_PATH,
  DEBUG_SET_MOCK_S3,
} from '@/common';

const setMockS3 = (enabled: boolean) => ipcRenderer.invoke(DEBUG_SET_MOCK_S3, enabled);
const isMockS3 = () => ipcRenderer.invoke(DEBUG_IS_MOCK_S3) as Promise<boolean>;
const getMockS3Path = () => ipcRenderer.invoke(DEBUG_GET_MOCK_S3_PATH) as Promise<string>;
const openMockS3Path = () => ipcRenderer.invoke(DEBUG_OPEN_MOCK_S3_PATH);

export const debug: DebugContext = {
  setMockS3,
  isMockS3,
  getMockS3Path,
  openMockS3Path,
};
