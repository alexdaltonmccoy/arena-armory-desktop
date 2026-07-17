// Mirrors the addon's Recorder schema (SCHEMA_VERSION 2 in Modules/Recorder.lua).

export interface MatchPlayer {
  name?: string
  realm?: string
  class?: string
  spec?: string
}

export interface MatchDeath {
  t: number
  side: 'enemy' | 'friendly'
  name?: string
}

export interface ScoreboardRow {
  name?: string
  team?: number
  race?: string
  class?: string
  killingBlows?: number
  deaths?: number
  damage?: number
  healing?: number
  /** Schema v3+: personal arena rating (TBC Anniversary has no arena teams).
   * `rating` is prematch; ratingChange applies after. */
  rating?: number
  ratingChange?: number
  prematchMMR?: number
  postmatchMMR?: number
}

/** Schema v2 timeline entry: cd = tracked cooldown, trinket = PvP trinket /
 * racial CC break, int = successful interrupt, cc = crowd control applied. */
export interface MatchEvent {
  t: number
  e: 'cd' | 'trinket' | 'int' | 'cc'
  side?: 'enemy' | 'friendly'
  name?: string
  spellId?: number
  spell?: string
  targetName?: string
  targetSpell?: string
  cat?: string
  lvl?: number
}

/** Schema v4: bucketed damage/healing per side + enemy focus target strip. */
export interface MatchTimeline {
  step: number
  dmg?: { f?: number[]; e?: number[] }
  heal?: { f?: number[]; e?: number[] }
  focus?: string[]
  swaps?: number
}

export interface TeamRating {
  name?: string
  oldRating?: number
  newRating?: number
  rating?: number
}

export interface ArenaMatch {
  guid: string
  schemaVersion: number
  startedAt: number
  endedAt?: number
  durationSeconds?: number
  map?: string
  bracket?: number
  result?: 'win' | 'loss' | 'draw' | 'abandoned' | 'unknown'
  ourSide?: number
  winner?: number
  player: MatchPlayer
  team: MatchPlayer[]
  enemyTeam: MatchPlayer[]
  deaths: MatchDeath[]
  events?: MatchEvent[]
  timeline?: MatchTimeline
  scoreboard?: ScoreboardRow[]
  ratings?: Record<string, TeamRating>
}

export interface CharacterInfo {
  name?: string
  realm?: string
  faction?: string
}

export interface SavedVariablesData {
  schemaVersion: number
  character: CharacterInfo
  matches: ArenaMatch[]
}

export interface AppSettings {
  savedVariablesPaths: string[]
  apiBaseUrl: string
  apiToken: string
  autoUpload: boolean
  /** Start with Windows/macOS login (hidden in the tray). */
  launchAtStartup: boolean
  /** Closing the window keeps the app syncing in the system tray. */
  closeToTray: boolean
}

export interface MatchRecord extends ArenaMatch {
  sourceFile: string
  importedAt: number
  uploadedAt?: number
}

export interface WatchedFile {
  path: string
  /** Last time WoW wrote the file (mtime) - i.e. the last logout//reload. */
  modifiedAt?: number
}

/** A character whose WTF AddOns.txt shows ArenaArmory disabled (or never
 * enabled) - games played on it won't be recorded. */
export interface AddonDisabledCharacter {
  realm: string
  name: string
  /** When the character last logged out (AddOns.txt mtime). */
  lastSeenAt: number
}

export interface SyncStatus {
  watching: string[]
  watchedFiles: WatchedFile[]
  addonDisabled: AddonDisabledCharacter[]
  totalMatches: number
  pendingUpload: number
  lastScanAt?: number
  lastUploadAt?: number
  lastError?: string
}
