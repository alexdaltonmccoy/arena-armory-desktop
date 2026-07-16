// Locate WoW SavedVariables files and parse the addon's Lua table into JSON.
import * as fs from 'fs'
import * as path from 'path'
import * as luaparse from 'luaparse'
import type { SavedVariablesData, ArenaMatch, AddonDisabledCharacter } from '../shared/types'

const DEFAULT_WOW_ROOTS = [
  'C:\\Program Files (x86)\\World of Warcraft',
  'C:\\Program Files\\World of Warcraft',
  'D:\\World of Warcraft'
]

// Classic flavors that can run the addon.
const FLAVOR_DIRS = ['_classic_', '_classic_era_', '_anniversary_']

/** Find every ArenaArmory.lua SavedVariables file across installs and accounts. */
export function discoverSavedVariablesFiles(extraRoots: string[] = []): string[] {
  const found: string[] = []
  for (const root of [...DEFAULT_WOW_ROOTS, ...extraRoots]) {
    for (const flavor of FLAVOR_DIRS) {
      const accountDir = path.join(root, flavor, 'WTF', 'Account')
      if (!fs.existsSync(accountDir)) continue
      for (const account of fs.readdirSync(accountDir)) {
        const sv = path.join(accountDir, account, 'SavedVariables', 'ArenaArmory.lua')
        if (fs.existsSync(sv)) found.push(sv)
      }
    }
  }
  return found
}

/** Only warn about characters that logged in reasonably recently; ancient
 * alts with the addon off are noise, not a problem worth a banner. */
const ADDON_WARNING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/**
 * WoW enables addons per character. A common trap: install the addon, play a
 * different character where it was never enabled, and wonder why no games
 * were recorded. WTF/Account/<acct>/<realm>/<char>/AddOns.txt lists each
 * character's addon states, so scan those and report recently played
 * characters where ArenaArmory isn't enabled.
 */
export function discoverAddonDisabledCharacters(
  extraRoots: string[] = []
): AddonDisabledCharacter[] {
  const out: AddonDisabledCharacter[] = []
  const cutoff = Date.now() - ADDON_WARNING_WINDOW_MS

  for (const root of [...DEFAULT_WOW_ROOTS, ...extraRoots]) {
    for (const flavor of FLAVOR_DIRS) {
      const accountDir = path.join(root, flavor, 'WTF', 'Account')
      if (!fs.existsSync(accountDir)) continue
      for (const account of readDirsSafe(accountDir)) {
        // Only accounts where the addon has actually run - otherwise a fresh
        // install would warn about every character before their first login.
        const sv = path.join(accountDir, account, 'SavedVariables', 'ArenaArmory.lua')
        if (!fs.existsSync(sv)) continue

        const accountPath = path.join(accountDir, account)
        for (const realm of readDirsSafe(accountPath)) {
          if (realm === 'SavedVariables') continue
          const realmPath = path.join(accountPath, realm)
          for (const character of readDirsSafe(realmPath)) {
            const addonsTxt = path.join(realmPath, character, 'AddOns.txt')
            let stat: fs.Stats
            try {
              stat = fs.statSync(addonsTxt)
            } catch {
              continue
            }
            if (stat.mtimeMs < cutoff) continue
            const content = fs.readFileSync(addonsTxt, 'utf8')
            const match = content.match(/^ArenaArmory:\s*(\w+)/m)
            const enabled = match ? match[1].toLowerCase() === 'enabled' : false
            if (!enabled) {
              out.push({ realm, name: character, lastSeenAt: stat.mtimeMs })
            }
          }
        }
      }
    }
  }
  return out.sort((a, b) => b.lastSeenAt - a.lastSeenAt)
}

function readDirsSafe(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }
}

type LuaNode = any

function luaValue(node: LuaNode): unknown {
  switch (node.type) {
    case 'StringLiteral':
      // luaparse keeps the raw quoted string in .raw; .value can be null for escapes
      return node.value ?? JSON.parse(normalizeRawString(node.raw))
    case 'NumericLiteral':
      return node.value
    case 'BooleanLiteral':
      return node.value
    case 'NilLiteral':
      return null
    case 'UnaryExpression':
      if (node.operator === '-') return -(luaValue(node.argument) as number)
      return null
    case 'TableConstructorExpression':
      return luaTable(node)
    default:
      return null
  }
}

function normalizeRawString(raw: string): string {
  // Lua single-quoted or double-quoted -> JSON double-quoted
  const inner = raw.slice(1, -1)
  return '"' + inner.replace(/\\'/g, "'").replace(/"/g, '\\"') + '"'
}

function luaTable(node: LuaNode): unknown {
  const arr: unknown[] = []
  const obj: Record<string, unknown> = {}
  let isArray = true

  for (const field of node.fields) {
    if (field.type === 'TableValue') {
      arr.push(luaValue(field.value))
    } else if (field.type === 'TableKeyString') {
      isArray = false
      obj[field.key.name] = luaValue(field.value)
    } else if (field.type === 'TableKey') {
      isArray = false
      const key = luaValue(field.key)
      obj[String(key)] = luaValue(field.value)
    }
  }

  if (isArray && Object.keys(obj).length === 0) return arr
  // Mixed table: fold array part in under numeric keys.
  arr.forEach((v, i) => {
    obj[String(i + 1)] = v
  })
  return obj
}

/** Parse a SavedVariables file and extract the ArenaArmoryMatches table. */
export function parseSavedVariables(filePath: string): SavedVariablesData | null {
  const source = fs.readFileSync(filePath, 'utf8')
  const ast = luaparse.parse(source, { luaVersion: '5.1', comments: false })

  for (const stmt of ast.body as LuaNode[]) {
    if (stmt.type !== 'AssignmentStatement') continue
    for (let i = 0; i < stmt.variables.length; i++) {
      const v = stmt.variables[i]
      if (v.type === 'Identifier' && v.name === 'ArenaArmoryMatches') {
        const value = luaValue(stmt.init[i]) as Record<string, unknown> | null
        if (!value) return null
        const matchesRaw = value.matches
        const matches: ArenaMatch[] = Array.isArray(matchesRaw)
          ? (matchesRaw as ArenaMatch[])
          : Object.values((matchesRaw as Record<string, ArenaMatch>) ?? {})
        return {
          schemaVersion: (value.schemaVersion as number) ?? 1,
          character: (value.character as SavedVariablesData['character']) ?? {},
          matches: matches.filter((m) => m && typeof m.guid === 'string')
        }
      }
    }
  }
  return null
}
