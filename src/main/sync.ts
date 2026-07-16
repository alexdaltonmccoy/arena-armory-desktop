// Watch SavedVariables files, import new matches, and upload them to the API.
import * as fs from 'fs'
import {
  discoverAddonDisabledCharacters,
  discoverSavedVariablesFiles,
  parseSavedVariables
} from './savedVariables'
import type { Store } from './store'
import type { AddonDisabledCharacter, MatchRecord, SyncStatus, WatchedFile } from '../shared/types'

export class SyncService {
  private watchers: fs.StatWatcher[] = []
  private watching: string[] = []
  private addonDisabled: AddonDisabledCharacter[] = []
  private lastScanAt?: number
  private lastUploadAt?: number
  private lastError?: string
  private onChange: () => void

  constructor(
    private store: Store,
    onChange: () => void
  ) {
    this.onChange = onChange
  }

  start(): void {
    this.stop()
    const files = new Set([
      ...discoverSavedVariablesFiles(),
      ...this.store.settings.savedVariablesPaths.filter((p) => fs.existsSync(p))
    ])
    this.watching = [...files]

    for (const file of this.watching) {
      // SavedVariables only change on logout//reload; polling every 15s is plenty.
      const watcher = fs.watchFile(file, { interval: 15_000 }, () => {
        void this.scanFile(file)
        this.refreshAddonDiagnostics()
      })
      this.watchers.push(watcher)
      void this.scanFile(file)
    }
    this.refreshAddonDiagnostics()
    this.onChange()
  }

  private refreshAddonDiagnostics(): void {
    try {
      this.addonDisabled = discoverAddonDisabledCharacters()
    } catch {
      this.addonDisabled = []
    }
  }

  stop(): void {
    for (const file of this.watching) fs.unwatchFile(file)
    this.watchers = []
    this.watching = []
  }

  async scanAll(): Promise<number> {
    let added = 0
    for (const file of this.watching) {
      added += await this.scanFile(file)
    }
    this.refreshAddonDiagnostics()
    return added
  }

  private async scanFile(file: string): Promise<number> {
    try {
      const data = parseSavedVariables(file)
      this.lastScanAt = Date.now()
      if (!data) return 0

      const records: MatchRecord[] = data.matches.map((m) => ({
        ...m,
        player: { ...m.player, ...(!m.player?.name ? data.character : {}) },
        sourceFile: file,
        importedAt: Date.now()
      }))
      const added = this.store.importMatches(records)
      if (added > 0) {
        this.lastError = undefined
        this.onChange()
        if (this.store.settings.autoUpload) void this.uploadPending()
      }
      return added
    } catch (err) {
      this.lastError = `Failed to parse ${file}: ${(err as Error).message}`
      this.onChange()
      return 0
    }
  }

  // Schema-v2 records carry event timelines, so payloads are bigger; chunking
  // keeps each request comfortably under serverless body-size limits.
  private static readonly UPLOAD_CHUNK_SIZE = 50

  async uploadPending(): Promise<{ uploaded: number; error?: string }> {
    const { apiBaseUrl, apiToken } = this.store.settings
    const pending = this.store.pendingUpload()
    if (pending.length === 0) return { uploaded: 0 }
    if (!apiToken) {
      this.lastError = 'No API token configured'
      this.onChange()
      return { uploaded: 0, error: this.lastError }
    }

    const url = `${apiBaseUrl.replace(/\/$/, '')}/api/matches/import`
    let uploaded = 0
    try {
      for (let i = 0; i < pending.length; i += SyncService.UPLOAD_CHUNK_SIZE) {
        const chunk = pending.slice(i, i + SyncService.UPLOAD_CHUNK_SIZE)
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiToken}`
          },
          body: JSON.stringify({ matches: chunk })
        })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
        }
        const body = (await res.json()) as { imported?: string[] }
        const guids = body.imported ?? chunk.map((m) => m.guid)
        this.store.markUploaded(guids)
        uploaded += guids.length
        this.lastUploadAt = Date.now()
        this.onChange()
      }
      this.lastError = undefined
      this.onChange()
      return { uploaded }
    } catch (err) {
      // Chunks that made it through are already marked uploaded; the failed
      // remainder stays pending and is retried on the next upload.
      this.lastError = `Upload failed: ${(err as Error).message}`
      this.onChange()
      return { uploaded, error: this.lastError }
    }
  }

  status(): SyncStatus {
    const watchedFiles: WatchedFile[] = this.watching.map((p) => {
      try {
        return { path: p, modifiedAt: fs.statSync(p).mtimeMs }
      } catch {
        return { path: p }
      }
    })
    return {
      watching: this.watching,
      watchedFiles,
      addonDisabled: this.addonDisabled,
      totalMatches: this.store.allMatches().length,
      pendingUpload: this.store.pendingUpload().length,
      lastScanAt: this.lastScanAt,
      lastUploadAt: this.lastUploadAt,
      lastError: this.lastError
    }
  }
}
