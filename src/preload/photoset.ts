import {
  PHOTOSET_ADD_IMAGES,
  PHOTOSET_CREATE,
  PHOTOSET_DELETE,
  PHOTOSET_EXPORT_METADATA,
  PHOTOSET_GET,
  PHOTOSET_LIST,
  PHOTOSET_MARK_UPLOADED,
  PHOTOSET_PUBLISH,
  PHOTOSET_SHOW_IN_FOLDER,
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
  markUploaded: (args) => ipcRenderer.invoke(PHOTOSET_MARK_UPLOADED, args),
  exportMetadata: (args) => ipcRenderer.invoke(PHOTOSET_EXPORT_METADATA, args),
  showInFolder: (args) => ipcRenderer.invoke(PHOTOSET_SHOW_IN_FOLDER, args),
};
