// Run with: npx tsx test/parse.test.ts
import * as path from 'path'
import * as assert from 'assert'
import { parseSavedVariables } from '../src/main/savedVariables'

const fixture = path.join(__dirname, 'fixtures', 'ArenaArmory.lua')
const data = parseSavedVariables(fixture)

assert.ok(data, 'parsed data should not be null')
assert.strictEqual(data.schemaVersion, 1)
assert.strictEqual(data.character.name, 'Testchar')
assert.strictEqual(data.character.realm, 'Whitemane')
assert.strictEqual(data.matches.length, 2)

const m = data.matches[0]
assert.strictEqual(m.guid, 'AA-1752537600-1a2b3c4d')
assert.strictEqual(m.map, 'Nagrand Arena')
assert.strictEqual(m.result, 'win')
assert.strictEqual(m.bracket, 2)
assert.strictEqual(m.team.length, 2)
assert.strictEqual(m.team[0].class, 'ROGUE')
assert.strictEqual(m.enemyTeam[1].spec, 'Holy')
assert.strictEqual(m.deaths[0].side, 'enemy')
assert.strictEqual(m.deaths[0].t, 231)
assert.ok(m.ratings, 'ratings should parse')
assert.strictEqual((m.ratings as Record<string, { newRating?: number }>)['0'].newRating, 1531)
assert.strictEqual(m.scoreboard?.[0].damage, 18453)

const m2 = data.matches[1]
assert.strictEqual(m2.result, 'loss')
assert.deepStrictEqual(m2.team, [])

console.log('All SavedVariables parser assertions passed.')
