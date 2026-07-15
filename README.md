# Arena Armory Desktop

Desktop companion app for the [ArenaArmory WoW addon](../wow-gladius) and [arenaarmory.com](https://arenaarmory.com).

Watches the addon's SavedVariables file, parses recorded arena matches into JSON, dedupes them by match GUID, and uploads them to the Arena Armory API for statistical analysis. Built with Electron + React + TypeScript (electron-vite), keeping the door open for the future video/screenshot coaching features.

## How it works

1. WoW writes `ArenaArmoryMatches` to `WTF\Account\<ACCOUNT>\SavedVariables\ArenaArmory.lua` on logout or `/reload`.
2. The app auto-discovers that file across common WoW install locations and Classic flavors (`_classic_`, `_classic_era_`, `_anniversary_`), or you can add a file manually. Files are polled every 15 seconds.
3. New matches (by GUID) are imported into a local store (`%APPDATA%\arena-armory-desktop\matches.json`).
4. On first launch the app provisions itself an upload token via `POST /api/tokens/register` (no sign-up, no manual steps; retries next launch if offline).
5. Pending matches upload automatically to `POST {apiBaseUrl}/api/matches/import` (auto-upload is on by default). "View my matches online" opens `arenaarmory.com/matches?token=...` so the website links itself with the same token.

## Development

```powershell
npm install
npm run dev        # launch Electron with hot reload
npm run typecheck  # tsc --noEmit
npm run build      # production build to out/
npx tsx test/parse.test.ts  # SavedVariables parser test
```

## Structure

| Path | Role |
|---|---|
| `src/main/savedVariables.ts` | WoW install discovery + Lua-to-JSON SavedVariables parser (luaparse) |
| `src/main/store.ts` | Settings + imported-match persistence with GUID dedupe |
| `src/main/sync.ts` | File watching, import, upload queue |
| `src/main/index.ts` | Electron main process + IPC |
| `src/preload/index.ts` | Context-isolated API bridge |
| `src/renderer/` | React UI: match table, sync status, settings |
| `src/shared/types.ts` | Match schema shared across processes (mirrors addon Recorder schema v1) |

## Roadmap

- Local stats (comp winrates, per-map) without upload
- Screenshot/video import per match for coaching review
- Live coaching overlay (screen capture)
