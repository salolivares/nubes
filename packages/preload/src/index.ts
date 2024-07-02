/**
 * @module preload
 */

import { contextBridge } from 'electron';
import { sha256sum } from './nodeCrypto';
import { versions } from './versions';

contextBridge.exposeInMainWorld('preload', {
  sha256sum,
  versions,
});
