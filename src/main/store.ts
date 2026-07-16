// Tiny JSON persistence for settings and imported matches (dedupe by match guid).
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import type { AppSettings, MatchRecord } from '../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  savedVariablesPaths: [],
  apiBaseUrl: 'https://arenaarmory.com',
  apiToken: '',
  autoUpload: true,
  launchAtStartup: true,
  closeToTray: true
}

function dataDir(): string {
  const dir = app.getPath('userData')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) }
  } catch {
    return fallback
  }
}

function writeJson(file: string, data: unknown): void {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

export class Store {
  private settingsFile = path.join(dataDir(), 'settings.json')
  private matchesFile = path.join(dataDir(), 'matches.json')

  settings: AppSettings
  private matches: Map<string, MatchRecord>

  constructor() {
    this.settings = readJson(this.settingsFile, DEFAULT_SETTINGS)
    const list = readJson<MatchRecord[]>(this.matchesFile, [])
    this.matches = new Map((Array.isArray(list) ? list : []).map((m) => [m.guid, m]))
  }

  saveSettings(partial: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...partial }
    writeJson(this.settingsFile, this.settings)
    return this.settings
  }

  /** Returns the number of newly imported matches. */
  importMatches(records: MatchRecord[]): number {
    let added = 0
    for (const record of records) {
      if (!this.matches.has(record.guid)) {
        this.matches.set(record.guid, record)
        added++
      }
    }
    if (added > 0) this.persistMatches()
    return added
  }

  markUploaded(guids: string[]): void {
    const now = Date.now()
    for (const guid of guids) {
      const m = this.matches.get(guid)
      if (m) m.uploadedAt = now
    }
    this.persistMatches()
  }

  allMatches(): MatchRecord[] {
    return [...this.matches.values()].sort((a, b) => b.startedAt - a.startedAt)
  }

  pendingUpload(): MatchRecord[] {
    return this.allMatches().filter((m) => !m.uploadedAt)
  }

  private persistMatches(): void {
    writeJson(this.matchesFile, this.allMatches())
  }
}
