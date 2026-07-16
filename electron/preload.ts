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
  getPrice: (
    id: string,
    rarity?: string,
  ): Promise<
    | { kind: 'ah'; lowestBin: number | null; avg3d: number | null; sales3d: number }
    | { kind: 'bazaar'; buy: number; sell: number }
    | null
  > => ipcRenderer.invoke('price:get', id, rarity),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  getSettings: (): Promise<Record<string, boolean>> => ipcRenderer.invoke('settings:get'),
  patchSettings: (patch: Record<string, boolean>): Promise<Record<string, boolean>> =>
    ipcRenderer.invoke('settings:patch', patch),
  checkUpdate: (): Promise<{
    updateAvailable: boolean;
    localVersion: string;
    remoteVersion: string;
    remoteBuiltAt: string | null;
  }> => ipcRenderer.invoke('update:check'),
  applyUpdate: (): Promise<{ started: boolean }> => ipcRenderer.invoke('update:apply'),
  onUpdateProgress: (cb: (pct: number) => void): (() => void) => {
    const listener = (_e: unknown, pct: number) => cb(pct);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  },
};

export type SbApi = typeof api;

contextBridge.exposeInMainWorld('sbApi', api);
