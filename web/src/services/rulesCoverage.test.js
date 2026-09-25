// rulesCoverage — every Firestore path the web client touches must have a
// `match` block in firestore.rules.
//
// Firestore is default-deny, so a collection with no rule doesn't error at
// deploy time — it just silently returns permission-denied to every
// browser. That is exactly how espnLiveScores shipped (Sep 2026): the
// poller wrote, the component listened, nobody could read. This test is
// static (no emulator), so it runs in `npm test` on any machine. The
// allow/deny semantics are tested against the emulator in CI
// (tests/rules/rules.test.mjs).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, '..')
const RULES = readFileSync(join(here, '../../../firestore.rules'), 'utf8')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|mjs)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

const code = walk(SRC).map((f) => readFileSync(f, 'utf8')).join('\n')

// COL.x → 'name'
const COL = {}
const colBlock = code.match(/const COL = \{([\s\S]*?)\n\}/)?.[1] ?? ''
for (const [, k, v] of colBlock.matchAll(/(\w+):\s*'(\w+)'/g)) COL[k] = v

function clientPaths() {
  const paths = new Set()
  for (const [, name] of code.matchAll(/(?:doc|collection)\(db,\s*'(\w+)'/g)) paths.add(name)
  for (const [, key] of code.matchAll(/(?:doc|collection)\(db,\s*COL\.(\w+)/g)) {
    if (key !== 'config' && COL[key]) paths.add(COL[key])
  }
  for (const [, id] of code.matchAll(/doc\(db,\s*COL\.config,\s*'(\w+)'/g)) paths.add(`config/${id}`)
  for (const [, id] of code.matchAll(/doc\(db,\s*'config',\s*'(\w+)'/g)) paths.add(`config/${id}`)
  paths.delete('config')
  return [...paths].sort()
}

function rulePaths() {
  const set = new Set()
  for (const [, a, b] of RULES.matchAll(/match \/(\w+)\/(\{?\w+\}?)/g)) {
    if (a === 'databases') continue
    set.add(a === 'config' ? `config/${b}` : a)
  }
  return set
}

test('COL map was found (guards the parser itself)', () => {
  assert.ok(Object.keys(COL).length >= 10, 'could not parse COL from firestoreService.js')
})

test('every client-read collection has a firestore.rules match block', () => {
  const rules = rulePaths()
  const client = clientPaths()
  assert.ok(client.length >= 20, `only found ${client.length} client paths — parser broke?`)
  const missing = client.filter((p) => !rules.has(p))
  assert.deepEqual(missing, [], `no rule (default-deny) for: ${missing.join(', ')}`)
})

test('the parser would have caught espnLiveScores', () => {
  const stripped = RULES.replace(/match \/espnLiveScores\/\{season\}/, 'match /somethingElse/{season}')
  const set = new Set([...stripped.matchAll(/match \/(\w+)\//g)].map((m) => m[1]))
  assert.equal(set.has('espnLiveScores'), false)
  assert.ok(clientPaths().includes('espnLiveScores'))
})
