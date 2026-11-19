#!/usr/bin/env node
// export-trades.mjs — copy the app's finished trades out of Firestore into
// data/trades-2025-on.csv, so the league's trade record also lives in git.
//
// Firestore `trades` is the source of truth (the app, the ESPN-email ingest and
// the league feed all write there). data/trades-2022-2024.csv covers the
// hand-kept workbook years; this file continues it from the app's own records,
// in the SAME 11 columns — one row per asset that moved — so anything that reads
// the old file reads this one.
//
// Only FINISHED trades are exported (status `completed` or `historical`).
// Proposals, counters, declines and cancellations never leave Firestore: this
// repo is public, and an offer somebody turned down is not league record.
// Trade notes/messages are not exported for the same reason.
//
// The file is rebuilt whole on every run from every finished trade, sorted by
// date then id, so a re-run is a no-op and a reversed trade drops out.
//
// Auth: `gcloud auth print-access-token` + Firestore REST, same as
// scrape-espn-week.mjs. Runs after the Tuesday scrape (ops/espn-weekly.sh).
//
// Usage (from web/):
//   node scripts/export-trades.mjs                      print what would be written
//   node scripts/export-trades.mjs --write              write data/trades-2025-on.csv
//   node scripts/export-trades.mjs --from-json f.json   read trades from a leagueState
//                                                       snapshot or a plain array (tests; no auth)
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../..')
const OUT = process.env.IFFL_TRADES_CSV || join(REPO, 'data/trades-2025-on.csv')
const PROJECT = 'iffl-auth'
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
export const HEADER = ['trade_id', 'season', 'date', 'to_team', 'from_team', 'asset', 'asset_type', 'pick_season', 'pick_slot', 'pick_round', 'pick_original_team']
const FINISHED = new Set(['completed', 'historical'])

// ── Firestore REST value → plain JS ────────────────────────────
export function decodeValue(v) {
  if (v == null || 'nullValue' in v) return null
  if ('stringValue' in v) return v.stringValue
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decodeValue)
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decodeValue(x)]))
  return null
}

// ── pure: trades → CSV rows ────────────────────────────────────
// "2027 R1 (A. Zurek)" → season 2027, round 1, original team A. Zurek.
// "2027 1.05 (Ryan)"   → also slot 1.05. "2027 Round 2" → round 2, no original team. Anything else keeps its text and blank pick columns.
export function parsePick(name) {
  const s = String(name ?? '')
  const season = (s.match(/\b(20\d\d)\b/) || [])[1] ?? ''
  const slot = (s.match(/\b(\d)\.(\d\d)\b/) || [])[0] ?? ''
  const round = slot ? slot[0] : ((s.match(/\bR(?:ound)? ?(\d)\b/i) || s.match(/\b(\d)(?:st|nd|rd|th)\b/i) || [])[1] ?? '')
  const orig = (s.match(/\(([^)]+)\)/) || [])[1] ?? ''
  return { season, slot, round, orig: orig.replace(/'s$/, '') }
}
const day = (v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\d/.test(v) ? v.slice(0, 10) : '')
// The 2022-24 file is split on bare commas by its reader, so a field can never hold one.
const cell = (v) => String(v ?? '').replace(/[,\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()

export function tradesToRows(trades) {
  const problems = []
  const done = (trades ?? []).filter((t) => FINISHED.has(t?.status))
    .map((t) => ({ ...t, _date: day(t.completedAt) || day(t.date) }))
    .sort((a, b) => a._date.localeCompare(b._date) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
  const rows = []
  for (const t of done) {
    const a = t.proposingTeamName, b = t.receivingTeamName
    if (!t.id || !a || !b) { problems.push(`${t.id ?? '(no id)'}: missing a team name — skipped`); continue }
    if (!t._date) problems.push(`${t.id}: no date`)
    const season = Number(t.season) || Number(t._date.slice(0, 4)) || ''
    // What the proposer gave goes TO the receiver, and the other way round.
    const sides = [[t.assetsFromProposer, b, a], [t.assetsFromReceiver, a, b]]
    let n = 0
    for (const [assets, to, from] of sides) {
      for (const x of assets ?? []) {
        const isPick = x?.assetType === 'draftPick' || x?.assetType === 'pick'
        const p = isPick ? parsePick(x.displayName) : { season: '', slot: '', round: '', orig: '' }
        if (!x?.displayName) { problems.push(`${t.id}: an asset with no name — skipped`); continue }
        rows.push([t.id, season, t._date, to, from, x.displayName, isPick ? 'pick' : 'player', p.season, p.slot, p.round, p.orig].map(cell))
        n++
      }
    }
    if (n === 0) problems.push(`${t.id}: finished trade with no assets`)
  }
  return { rows, trades: new Set(rows.map((r) => r[0])).size, problems }
}
export const toCsv = (rows) => [HEADER.join(','), ...rows.map((r) => r.join(','))].join('\n') + '\n'

// ── Firestore read ─────────────────────────────────────────────
async function fetchTrades() {
  const token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim()
  const out = []
  let pageToken = ''
  do {
    const res = await fetch(`${FS_BASE}/trades?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`Firestore list trades: ${res.status} ${await res.text()}`)
    const j = await res.json()
    for (const d of j.documents ?? []) out.push({ id: d.name.split('/').pop(), ...decodeValue({ mapValue: { fields: d.fields ?? {} } }) })
    pageToken = j.nextPageToken ?? ''
  } while (pageToken)
  return out
}

async function main() {
  const argv = process.argv.slice(2)
  const from = argv.includes('--from-json') ? argv[argv.indexOf('--from-json') + 1] : null
  let trades
  if (from) {
    const j = JSON.parse(readFileSync(from, 'utf8'))
    const t = Array.isArray(j) ? j : (j?.data?.trades ?? j?.trades)
    trades = Array.isArray(t) ? t : Object.entries(t ?? {}).map(([id, v]) => ({ id, ...v }))
  } else trades = await fetchTrades()
  const { rows, trades: n, problems } = tradesToRows(trades)
  for (const p of problems) console.log(`warn: ${p}`)
  // An empty read is far likelier a failed read than a league with no trades; never
  // replace a populated file with a header.
  if (n === 0) throw new Error(`no finished trades in ${trades.length} documents — refusing to write`)
  console.log(`${trades.length} trade documents → ${n} finished trades, ${rows.length} asset rows`)
  if (!argv.includes('--write')) { console.log(`not written (add --write): ${OUT}`); return }
  writeFileSync(OUT, toCsv(rows))
  console.log(`wrote ${OUT}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`ERROR ${e.message}`); process.exit(1) })
}
