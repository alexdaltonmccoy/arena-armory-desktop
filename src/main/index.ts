import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu } from 'electron'
import * as path from 'path'
import { Store } from './store'
import { SyncService } from './sync'
import { ensureToken } from './registration'
import type { AppSettings } from '../shared/types'

let win: BrowserWindow | null = null
let tray: Tray | null = null
// Set when the user picks Quit (tray menu / Cmd+Q); otherwise closing the
// window just hides it so sync keeps running in the tray.
let quitting = false

const store = new Store()
const sync = new SyncService(store, () => {
  win?.webContents.send('sync:changed', sync.status())
  updateTrayTooltip()
})

// A second launch (e.g. double-clicking the shortcut while tray-minimized)
// should surface the existing window, not start a duplicate watcher.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
}

const startHidden = process.argv.includes('--hidden')

function appIconPath(): string {
  const file = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  return path.join(app.getAppPath(), 'build', file)
}

// Mirrors the site's slugify() so character links land on the right page.
function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function showWindow(): void {
  if (!win || win.isDestroyed()) {
    createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    title: 'Arena Armory',
    backgroundColor: '#0d0b08',
    icon: appIconPath(),
    show: !startHidden,
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

  win.on('close', (e) => {
    if (!quitting && store.settings.closeToTray) {
      e.preventDefault()
      win?.hide()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function updateTrayTooltip(): void {
  if (!tray) return
  const s = sync.status()
  const pending = s.pendingUpload > 0 ? ` · ${s.pendingUpload} pending upload` : ''
  tray.setToolTip(`Arena Armory · ${s.totalMatches} matches${pending}`)
}

function createTray(): void {
  tray = new Tray(appIconPath())
  const menu = Menu.buildFromTemplate([
    { label: 'Open Arena Armory', click: () => showWindow() },
    { type: 'separator' },
    {
      label: 'Scan for new matches',
      click: () => {
        void sync.scanAll()
      }
    },
    {
      label: 'Upload pending',
      click: () => {
        void sync.uploadPending()
      }
    },
    { label: 'View matches online', click: () => void openWebMatches() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
  tray.on('double-click', () => showWindow())
  updateTrayTooltip()
}

function applyLaunchAtStartup(): void {
  // In dev, openAtLogin would register the bare electron binary - skip it.
  if (!app.isPackaged) return
  app.setLoginItemSettings({
    openAtLogin: store.settings.launchAtStartup,
    args: ['--hidden']
  })
}

async function openWebMatches(): Promise<AppSettings> {
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
}

app.whenReady().then(() => {
  ipcMain.handle('settings:get', () => store.settings)
  ipcMain.handle('settings:set', (_e, partial: Partial<AppSettings>) => {
    const settings = store.saveSettings(partial)
    if ('launchAtStartup' in partial) applyLaunchAtStartup()
    if ('savedVariablesPaths' in partial) sync.start() // re-resolve watched files
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
  ipcMain.handle('matches:openWeb', () => openWebMatches())
  ipcMain.handle('matches:openCharacter', async (_e, name: string, realm: string) => {
    const base = store.settings.apiBaseUrl.replace(/\/$/, '')
    await shell.openExternal(`${base}/character/${slugify(realm)}/${slugify(name)}`)
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
  createTray()
  applyLaunchAtStartup()
  sync.start()

  // Self-provision an upload token on first launch, then push anything pending.
  void ensureToken(store).then((ok) => {
    if (ok && store.settings.autoUpload) void sync.uploadPending()
    win?.webContents.send('sync:changed', sync.status())
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else showWindow()
  })
})

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  // With close-to-tray the window hides instead of closing, so reaching this
  // means the user actually closed it (closeToTray off) - quit like a normal
  // app on Windows/Linux.
  if (process.platform !== 'darwin') app.quit()
})
