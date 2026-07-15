// First-launch self-provisioning: fetch an anonymous upload token from the
// API so the user never has to create or paste credentials manually.
import * as os from 'os'
import type { Store } from './store'

export async function ensureToken(store: Store): Promise<boolean> {
  if (store.settings.apiToken) return true

  try {
    const base = store.settings.apiBaseUrl.replace(/\/$/, '')
    const res = await fetch(`${base}/api/tokens/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: os.hostname() })
    })
    if (!res.ok) return false
    const body = (await res.json()) as { token?: string }
    if (!body.token) return false
    store.saveSettings({ apiToken: body.token })
    return true
  } catch {
    // Offline or API not deployed yet; retried on next launch or manual upload.
    return false
  }
}
