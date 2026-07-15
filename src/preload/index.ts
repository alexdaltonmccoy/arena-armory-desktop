import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, MatchRecord, SyncStatus } from '../shared/types'

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', partial),
  addSavedVariablesFile: (): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:addSavedVariablesFile'),
  listMatches: (): Promise<MatchRecord[]> => ipcRenderer.invoke('matches:list'),
  openWebMatches: (): Promise<AppSettings> => ipcRenderer.invoke('matches:openWeb'),
  getSyncStatus: (): Promise<SyncStatus> => ipcRenderer.invoke('sync:status'),
  scanNow: (): Promise<{ added: number; status: SyncStatus }> => ipcRenderer.invoke('sync:scan'),
  uploadNow: (): Promise<{ uploaded: number; error?: string; status: SyncStatus }> =>
    ipcRenderer.invoke('sync:upload'),
  onSyncChanged: (cb: (status: SyncStatus) => void): (() => void) => {
    const listener = (_e: unknown, status: SyncStatus): void => cb(status)
    ipcRenderer.on('sync:changed', listener)
    return () => ipcRenderer.removeListener('sync:changed', listener)
  }
}

contextBridge.exposeInMainWorld('arenaArmory', api)

export type ArenaArmoryApi = typeof api
