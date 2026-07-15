// Ad-hoc check against a real SavedVariables file from live arena games.
// Usage: npx tsx test/parse-real.ts "<path-to-ArenaArmory.lua>"
import { parseSavedVariables } from '../src/main/savedVariables'

const file = process.argv[2]
if (!file) {
  console.error('Usage: npx tsx test/parse-real.ts <path>')
  process.exit(1)
}

const data = parseSavedVariables(file)
if (!data) {
  console.error('FAILED: no ArenaArmoryMatches table found')
  process.exit(1)
}

console.log(`character: ${data.character.name}-${data.character.realm} (${data.character.faction})`)
console.log(`matches: ${data.matches.length}\n`)
for (const m of data.matches) {
  const team = m.team.map((p) => `${p.spec ?? '?'} ${p.class}`).join(' / ')
  const enemy = m.enemyTeam.map((p) => `${p.spec ?? '?'} ${p.class}`).join(' / ')
  console.log(`${m.guid}`)
  console.log(`  ${m.map} ${m.bracket}v${m.bracket} ${m.result} in ${m.durationSeconds}s`)
  console.log(`  as: ${team}`)
  console.log(`  vs: ${enemy}`)
  console.log(`  deaths: ${(m.deaths ?? []).map((d) => `${d.name}@${d.t}s(${d.side})`).join(', ') || 'none'}`)
  console.log(`  scoreboard rows: ${m.scoreboard?.length ?? 0}, ratings keys: ${Object.keys(m.ratings ?? {}).join(',') || 'none'}\n`)
}
