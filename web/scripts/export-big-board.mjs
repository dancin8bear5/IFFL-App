// export-big-board — dump the bigBoard collection to CSV before retiring it.
//
// The Big Board was removed from the app on Aug 31, 2026. Removing the code
// does NOT remove the data: the `bigBoard` collection is still in Firestore
// and its security rule is still in place, so the board can be brought back
// by restoring the view and re-reading the same documents.
//
// This script exists so there is also a copy OUTSIDE Firestore. Run it once
// before you ever delete the collection, and keep the CSV with the backups.
//
// Every field is written, not a chosen subset — the point of a backup is to
// be able to reconstruct, and a column you dropped is one you cannot get
// back. Columns are the union of every key seen across all documents, so a
// field added later still comes through.
//
// Auth: `gcloud auth print-access-token` against the Firestore REST API,
// the same path import-history.mjs uses. There is no serviceAccountKey.json
// and there should not be one.
//
// Usage (from web/):
//   node scripts/export-big-board.mjs                  # writes ../data/big-board-export-<date>.csv
//   node scripts/export-big-board.mjs /tmp/board.csv   # or a path you choose
import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PROJECT = 'iffl-auth'
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

const stamp = new Date().toISOString().slice(0, 10)
const out = process.argv[2] ?? join(ROOT, `data/big-board-export-${stamp}.csv`)

function decodeValue(v) {
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('booleanValue' in v) return v.booleanValue
  if ('nullValue' in v) return null
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decodeValue)
  if ('mapValue' in v) {
    return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decodeValue(x)]))
  }
  return v
}

let token
try {
  token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim()
} catch {
  console.error('Could not get a token. Run `gcloud auth login` first (jaredrogtaylor@).')
  process.exit(1)
}

const rows = []
let pageToken = ''
do {
  const url = `${BASE}/bigBoard?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    console.error(`GET bigBoard failed: ${res.status} ${await res.text()}`)
    process.exit(1)
  }
  const body = await res.json()
  for (const d of body.documents ?? []) {
    rows.push({
      id: d.name.split('/').pop(),
      ...Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, decodeValue(v)])),
    })
  }
  pageToken = body.nextPageToken ?? ''
} while (pageToken)

if (rows.length === 0) {
  console.log('bigBoard is empty — nothing to export. (Already cleared, or never seeded.)')
  process.exit(0)
}

// Union of every key across every document, so a field only some rows carry
// still gets a column rather than being silently dropped.
const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
const cell = (v) => {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n'
writeFileSync(out, csv)

console.log(`${rows.length} rows, ${cols.length} columns -> ${out}`)
console.log(`columns: ${cols.join(', ')}`)
const kept = rows.filter((r) => r.kdm === 'K').length
if (kept) console.log(`(${kept} marked Keep)`)
