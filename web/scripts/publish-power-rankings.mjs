#!/usr/bin/env node
/**
 * publish-power-rankings — push the generated payload into Firestore.
 *
 *   node scripts/publish-power-rankings.mjs <payload.json> [--dry-run]
 *
 * Layout, and the reason for it:
 *
 *   powerRankings/{edition}                 meta — edition, date, released[]
 *   powerRankings/{edition}/drops/intro     lookback + intro + foreword
 *   powerRankings/{edition}/drops/12-9      teams
 *   powerRankings/{edition}/drops/8-5       teams
 *   powerRankings/{edition}/drops/4-1       teams
 *
 * ONE DOC PER DROP so an unreleased write-up is never sent to a browser.
 * The meta doc carries no content — it is safe to read at any time, and the
 * client listens to it so opening a drop lands in seconds.
 *
 * It deliberately does NOT publish the ladder. A stored ladder has to carry
 * all twelve rank→team pairs to be useful, and that IS the reveal; the
 * client derives it from whichever drops are public instead.
 *
 * `released` is NOT taken from the payload. The generator ships every drop
 * as released; publishing that would put the whole thing live the moment it
 * lands. Existing release state is preserved on re-publish, and a first
 * publish starts closed — pass --release=intro,12-9 to override.
 *
 * Auth: `gcloud auth print-access-token`, same as import-history.mjs. There
 * is no serviceAccountKey.json on this Mac and there should not be.
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const PROJECT = 'iffl-auth'
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const VALID = ['intro', '12-9', '8-5', '4-1']

const path = process.argv[2]
const dryRun = process.argv.includes('--dry-run')
const relArg = process.argv.find((a) => a.startsWith('--release='))
if (!path) {
  console.error('usage: node scripts/publish-power-rankings.mjs <payload.json> [--release=intro,12-9] [--dry-run]')
  process.exit(1)
}

const payload = JSON.parse(readFileSync(path, 'utf8'))
const editionId = payload.edition.toLowerCase().replace(/\s+/g, '_')

// Deferred: a --dry-run must work anywhere, including a machine with no
// gcloud, so the shaping can be checked without credentials.
let headers = null
function auth() {
  if (headers) return headers
  const token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim()
  headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  return headers
}

const enc = (v) => {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } }
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } }
}
const dec = (v) => {
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(dec)
  if ('stringValue' in v) return v.stringValue
  return null
}

// Keep whatever is already live. Re-publishing corrected copy must never
// change what the league can see.
let released = []
if (!dryRun) {
  const res = await fetch(`${BASE}/powerRankings/${editionId}`, { headers: auth() })
  if (res.ok) {
    const body = await res.json()
    released = (dec(body.fields?.released ?? { arrayValue: {} }) ?? []).filter((k) => VALID.includes(k))
  }
}
if (relArg) {
  released = relArg.slice('--release='.length).split(',').map((s) => s.trim()).filter(Boolean)
  const bad = released.filter((k) => !VALID.includes(k))
  if (bad.length) { console.error(`unknown drop key(s): ${bad.join(', ')}`); process.exit(1) }
}

const docs = [
  [`powerRankings/${editionId}`, { edition: payload.edition, date: payload.date, released }],
  [`powerRankings/${editionId}/drops/intro`, {
    lookback: payload.lookback, intro: payload.intro, foreword: payload.foreword,
  }],
]
for (const key of ['12-9', '8-5', '4-1']) {
  const drop = payload.drops?.[key]
  if (!drop) { console.error(`payload is missing drop ${key}`); process.exit(1) }
  docs.push([`powerRankings/${editionId}/drops/${key}`, { teams: drop.teams }])
}

console.log(`edition ${payload.edition} → powerRankings/${editionId}`)
for (const [p, d] of docs) {
  const n = d.teams ? `${d.teams.length} teams` : `${Object.keys(d).length} fields`
  console.log(`  ${p}  (${n})`)
}
console.log(`released: ${released.length ? released.join(', ') : '(nothing — open drops from Admin → Season)'}`)
if (dryRun) { console.log('\ndry run — nothing written'); process.exit(0) }

const res = await fetch(`${BASE.replace('/documents', '')}/documents:commit`, {
  method: 'POST',
  headers: auth(),
  body: JSON.stringify({
    writes: docs.map(([p, d]) => ({
      update: {
        name: `projects/${PROJECT}/databases/(default)/documents/${p}`,
        fields: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, enc(v)])),
      },
    })),
  }),
})
if (!res.ok) { console.error(`commit failed: ${res.status} ${await res.text()}`); process.exit(1) }
console.log('\npublished.')
