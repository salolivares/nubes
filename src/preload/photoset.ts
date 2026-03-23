import {
  PHOTOSET_ADD_IMAGES,
  PHOTOSET_CREATE,
  PHOTOSET_DELETE,
  PHOTOSET_GET,
  PHOTOSET_LIST,
  PHOTOSET_PUBLISH,
  PHOTOSET_UPDATE,
} from '@common';
import { ipcRenderer } from 'electron';

export const photosets: PhotosetContext = {
  list: (args) => ipcRenderer.invoke(PHOTOSET_LIST, args),
  get: (args) => ipcRenderer.invoke(PHOTOSET_GET, args),
  create: (args) => ipcRenderer.invoke(PHOTOSET_CREATE, args),
  update: (args) => ipcRenderer.invoke(PHOTOSET_UPDATE, args),
  delete: (args) => ipcRenderer.invoke(PHOTOSET_DELETE, args),
  addImages: (args) => ipcRenderer.invoke(PHOTOSET_ADD_IMAGES, args),
  publish: (args) => ipcRenderer.invoke(PHOTOSET_PUBLISH, args),
};
