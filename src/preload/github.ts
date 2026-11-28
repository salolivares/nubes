import {
  GITHUB_CLEAR_TOKEN,
  GITHUB_OPEN_PULL_REQUEST,
  GITHUB_SAVE_SETTINGS,
  GITHUB_SETTINGS,
  GITHUB_TEST_CONNECTION,
} from '@common';
import { ipcRenderer } from 'electron';

export const github: GitHubContext = {
  settings: () => ipcRenderer.invoke(GITHUB_SETTINGS),
  saveSettings: (args) => ipcRenderer.invoke(GITHUB_SAVE_SETTINGS, args),
  clearToken: () => ipcRenderer.invoke(GITHUB_CLEAR_TOKEN),
  testConnection: () => ipcRenderer.invoke(GITHUB_TEST_CONNECTION),
  openPullRequest: (args) => ipcRenderer.invoke(GITHUB_OPEN_PULL_REQUEST, args),
};
