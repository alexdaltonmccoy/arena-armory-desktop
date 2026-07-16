import { useEffect, useState } from 'react'
import type { AppSettings, MatchRecord, SyncStatus } from '../../shared/types'
import logo from './assets/logo.png'

const CURSEFORGE_ADDON_URL = 'https://www.curseforge.com/wow/addons/arena-armory'
const APP_STORE_URL = 'https://apps.apple.com/us/app/arena-armory/id6788956362'
const WEBSITE_URL = 'https://arenaarmory.com'

declare global {
  interface Window {
    arenaArmory: {
      getSettings(): Promise<AppSettings>
      setSettings(p: Partial<AppSettings>): Promise<AppSettings>
      addSavedVariablesFile(): Promise<AppSettings>
      listMatches(): Promise<MatchRecord[]>
      openWebMatches(): Promise<AppSettings>
      getSyncStatus(): Promise<SyncStatus>
      scanNow(): Promise<{ added: number; status: SyncStatus }>
      uploadNow(): Promise<{ uploaded: number; error?: string; status: SyncStatus }>
      onSyncChanged(cb: (s: SyncStatus) => void): () => void
    }
  }
}

function comp(team: { class?: string; spec?: string }[]): string {
  if (!team || team.length === 0) return '?'
  return team
    .map((p) => (p.spec ? `${p.spec} ` : '') + (p.class ?? '?').toLowerCase())
    .join(' / ')
}

function fmtDuration(s?: number): string {
  if (s == null) return '-'
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function fmtAgo(ms?: number): string {
  if (!ms) return 'never'
  const mins = Math.round((Date.now() - ms) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** Shorten C:\...\WTF\Account\NAME\SavedVariables\ArenaArmory.lua to the
 * parts a player recognizes: flavor + account. */
function fmtWatchedPath(p: string): string {
  const m = p.match(/(_[a-z_]+_)[\\/]WTF[\\/]Account[\\/]([^\\/]+)/i)
  return m ? `${m[1]} · ${m[2]}` : p
}

export default function App(): React.JSX.Element {
  const [matches, setMatches] = useState<MatchRecord[]>([])
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [settings, setSettingsState] = useState<AppSettings | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = async (): Promise<void> => {
    setMatches(await window.arenaArmory.listMatches())
    setStatus(await window.arenaArmory.getSyncStatus())
  }

  useEffect(() => {
    void refresh()
    void window.arenaArmory.getSettings().then(setSettingsState)
    return window.arenaArmory.onSyncChanged(() => void refresh())
  }, [])

  const scan = async (): Promise<void> => {
    setBusy(true)
    await window.arenaArmory.scanNow()
    await refresh()
    setBusy(false)
  }

  const upload = async (): Promise<void> => {
    setBusy(true)
    await window.arenaArmory.uploadNow()
    await refresh()
    setBusy(false)
  }

  const wins = matches.filter((m) => m.result === 'win').length
  const losses = matches.filter((m) => m.result === 'loss').length

  return (
    <div className="app">
      <header>
        <div className="brand">
          <img src={logo} alt="" className="brand-logo" />
          <h1>Arena Armory</h1>
        </div>
        <div className="actions">
          <button onClick={scan} disabled={busy}>Scan now</button>
          <button onClick={upload} disabled={busy || !status?.pendingUpload}>
            Upload {status?.pendingUpload ? `(${status.pendingUpload})` : ''}
          </button>
        </div>
      </header>

      <section className="statusbar">
        <span>
          Watching {status?.watching.length ?? 0} SavedVariables file(s)
        </span>
        <span>
          {matches.length} matches · {wins}W / {losses}L
        </span>
        {status?.lastError && <span className="error">{status.lastError}</span>}
      </section>

      {status && status.watchedFiles.length > 0 && (
        <section className="watched-files">
          {status.watchedFiles.map((f) => (
            <span key={f.path} className="watched-file" title={f.path}>
              {fmtWatchedPath(f.path)}
              <span className="watched-file-time"> · last game data written {fmtAgo(f.modifiedAt)}</span>
            </span>
          ))}
          <span className="watched-hint">
            WoW saves match data only on logout or /reload - do one after your games.
          </span>
        </section>
      )}

      {status && status.watchedFiles.length === 0 && (
        <section className="warning-banner">
          No WoW installation found at the standard locations. Click &quot;Add
          SavedVariables file...&quot; and pick{' '}
          <code>World of Warcraft\_anniversary_\WTF\Account\&lt;ACCOUNT&gt;\SavedVariables\ArenaArmory.lua</code>{' '}
          (the file appears after your first login with the addon installed).
        </section>
      )}

      {status && status.addonDisabled.length > 0 && (
        <section className="warning-banner">
          The ArenaArmory addon is <strong>not enabled</strong> on{' '}
          {status.addonDisabled
            .slice(0, 4)
            .map((c) => `${c.name} (${c.realm})`)
            .join(', ')}
          {status.addonDisabled.length > 4
            ? ` and ${status.addonDisabled.length - 4} more`
            : ''}
          . Games on those characters are not recorded - enable it from the
          AddOns button at character select.
        </section>
      )}

      <section className="settings">
        <span className={settings?.apiToken ? 'connected' : 'disconnected'}>
          {settings?.apiToken
            ? 'Linked to arenaarmory.com'
            : 'Not linked yet - connects automatically when online'}
        </span>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings?.autoUpload ?? true}
            onChange={(e) => {
              void window.arenaArmory
                .setSettings({ autoUpload: e.target.checked })
                .then(setSettingsState)
            }}
          />
          Auto-upload new matches
        </label>
        <button
          onClick={() => void window.arenaArmory.openWebMatches().then(setSettingsState)}
        >
          View my matches online
        </button>
        <button
          onClick={() => void window.arenaArmory.addSavedVariablesFile().then(setSettingsState)}
        >
          Add SavedVariables file...
        </button>
      </section>

      <table className="matches">
        <thead>
          <tr>
            <th>Date</th>
            <th>Map</th>
            <th>Bracket</th>
            <th>Result</th>
            <th>Duration</th>
            <th>As</th>
            <th>Vs</th>
            <th>Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr key={m.guid} className={m.result}>
              <td>{new Date(m.startedAt * 1000).toLocaleString()}</td>
              <td>{m.map ?? '?'}</td>
              <td>{m.bracket ? `${m.bracket}v${m.bracket}` : '?'}</td>
              <td className="result">{m.result ?? '?'}</td>
              <td>{fmtDuration(m.durationSeconds)}</td>
              <td>{comp(m.team)}</td>
              <td>{comp(m.enemyTeam)}</td>
              <td>{m.uploadedAt ? 'yes' : 'no'}</td>
            </tr>
          ))}
          {matches.length === 0 && (
            <tr>
              <td colSpan={8} className="empty">
                No matches imported yet. Play arenas with the{' '}
                <a href={CURSEFORGE_ADDON_URL} target="_blank" rel="noreferrer">
                  ArenaArmory addon
                </a>
                , then /reload or log out so WoW writes SavedVariables to disk.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <footer>
        <a href={CURSEFORGE_ADDON_URL} target="_blank" rel="noreferrer">
          WoW Addon (CurseForge)
        </a>
        <span className="dot">·</span>
        <a href={APP_STORE_URL} target="_blank" rel="noreferrer">
          iOS App (App Store)
        </a>
        <span className="dot">·</span>
        <a href={WEBSITE_URL} target="_blank" rel="noreferrer">
          arenaarmory.com
        </a>
      </footer>
    </div>
  )
}
