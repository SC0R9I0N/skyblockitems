import { contextBridge, ipcRenderer } from 'electron';

const api = {
  loadData: (): Promise<string> => ipcRenderer.invoke('data:load'),
  refreshData: (): Promise<string> => ipcRenderer.invoke('data:refresh'),
  getFavorites: (): Promise<string[]> => ipcRenderer.invoke('favorites:get'),
  toggleFavorite: (id: string): Promise<string[]> => ipcRenderer.invoke('favorites:toggle', id),
  wikiExtract: (
    id: string,
    urls: string[],
  ): Promise<{ url: string; text: string } | null> => ipcRenderer.invoke('wiki:extract', id, urls),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  getSettings: (): Promise<Record<string, boolean>> => ipcRenderer.invoke('settings:get'),
  patchSettings: (patch: Record<string, boolean>): Promise<Record<string, boolean>> =>
    ipcRenderer.invoke('settings:patch', patch),
};

export type SbApi = typeof api;

contextBridge.exposeInMainWorld('sbApi', api);
