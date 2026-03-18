import { ipcRenderer } from 'electron';

const setMockS3 = (enabled: boolean) => ipcRenderer.invoke('debug:setMockS3', enabled);
const isMockS3 = () => ipcRenderer.invoke('debug:isMockS3') as Promise<boolean>;
const getMockS3Path = () => ipcRenderer.invoke('debug:getMockS3Path') as Promise<string>;
const openMockS3Path = () => ipcRenderer.invoke('debug:openMockS3Path');

export const debug: DebugContext = {
  setMockS3,
  isMockS3,
  getMockS3Path,
  openMockS3Path,
};
