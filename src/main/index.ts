import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import * as path from 'path'
import { Store } from './store'
import { SyncService } from './sync'
import { ensureToken } from './registration'
import type { AppSettings } from '../shared/types'

let win: BrowserWindow | null = null
const store = new Store()
const sync = new SyncService(store, () => {
  win?.webContents.send('sync:changed', sync.status())
})

function appIconPath(): string {
  const file = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  return path.join(app.getAppPath(), 'build', file)
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    title: 'Arena Armory',
    backgroundColor: '#0d0b08',
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Renderer links (target="_blank") open in the system browser, never a
  // second Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('settings:get', () => store.settings)
  ipcMain.handle('settings:set', (_e, partial: Partial<AppSettings>) => {
    const settings = store.saveSettings(partial)
    sync.start() // re-resolve watched files with new paths
    return settings
  })
  ipcMain.handle('settings:addSavedVariablesFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select ArenaArmory.lua SavedVariables file',
      filters: [{ name: 'Lua SavedVariables', extensions: ['lua'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return store.settings
    const paths = [...new Set([...store.settings.savedVariablesPaths, ...result.filePaths])]
    const settings = store.saveSettings({ savedVariablesPaths: paths })
    sync.start()
    return settings
  })

  ipcMain.handle('matches:list', () => store.allMatches())
  ipcMain.handle('matches:openWeb', async () => {
    // Make sure a token exists (e.g. first launch was offline), then open the
    // matches page with it so the site is signed in without any copy/paste.
    await ensureToken(store)
    const base = store.settings.apiBaseUrl.replace(/\/$/, '')
    const token = store.settings.apiToken
    const url = token
      ? `${base}/matches?token=${encodeURIComponent(token)}`
      : `${base}/matches`
    await shell.openExternal(url)
    return store.settings
  })
  ipcMain.handle('sync:status', () => sync.status())
  ipcMain.handle('sync:scan', async () => {
    const added = await sync.scanAll()
    return { added, status: sync.status() }
  })
  ipcMain.handle('sync:upload', async () => {
    const result = await sync.uploadPending()
    return { ...result, status: sync.status() }
  })

  createWindow()
  sync.start()

  // Self-provision an upload token on first launch, then push anything pending.
  void ensureToken(store).then((ok) => {
    if (ok && store.settings.autoUpload) void sync.uploadPending()
    win?.webContents.send('sync:changed', sync.status())
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
