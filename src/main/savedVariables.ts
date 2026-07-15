// Locate WoW SavedVariables files and parse the addon's Lua table into JSON.
import * as fs from 'fs'
import * as path from 'path'
import * as luaparse from 'luaparse'
import type { SavedVariablesData, ArenaMatch } from '../shared/types'

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
