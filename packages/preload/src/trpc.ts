import { ipcRenderer } from 'electron';
import type { IpcRequest } from '../../../types/api';

export const trpc = (req: IpcRequest) => ipcRenderer.invoke('trpc', req);
