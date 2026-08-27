#!/usr/bin/env node
// backup-firestore.mjs — weekly snapshot of the league's irreplaceable data.
//
// WHAT IT BACKS UP, AND WHAT IT DELIBERATELY SKIPS
//
// The derived history collections (historyMatchups, historyTeamSeasons,
// historyPlayerSeasons, historyPlayerWeeks, historyDrafts, historyAggregates)
// are ~45 of the database's ~47 MiB — and every byte of them is rebuilt from
// data/iffl_fantasy_history_2008-2025.csv by import-history.mjs, which is in
// git. Backing them up weekly would mean copying 45 MiB of reproducible data
// forever. They are skipped, and the restore path for them is the CSV.
//
// What IS backed up is the ~1.5 MiB that exists nowhere else: rosters, trades,
// the transaction ledger, rules and votes, avatars, keeper plans, the big
// board, and — most critically — config/league, which holds the uid→team map
// and the email auto-link map. Losing that doesn't just lose data, it locks
// the whole league out of their own accounts.
//
// WHERE IT WRITES, AND WHY NOT GIT
//
// The GitHub repo is PUBLIC. config/league contains all 11 members' real email
// addresses and their Firebase UIDs, so these snapshots must never be
// committed. They go to a local directory (gitignored) and, when available, to
// iCloud Drive for an off-machine copy that stays private.
//
// Auth: `gcloud auth print-access-token` — the commissioner's own login. No
// service-account key exists on this machine.
//
// Usage:
//   node scripts/backup-firestore.mjs            # write a snapshot
//   node scripts/backup-firestore.mjs --dry-run  # report only
import { execSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PROJECT = 'iffl-auth'
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const KEEP = 12 // ~3 months of weekly snapshots

// Everything that cannot be regenerated from a file in the repo.
const COLLECTIONS = [
  'players', 'draftPicks', 'trades', 'tradeVotes', 'transactions', 'messages',
  'rules', 'playerFMK', 'playerInterests', 'teamAvatars', 'bigBoard',
  'userSettings', 'keeperPlans', 'parlayEntries', 'parlayWeeks',
  'leagueRecords', 'leagueHistory', 'weeklyScores', 'playoffs',
  'tradeIngests', 'groupmeTradeSignals', 'users', 'Users',
]
// config is a collection of single docs; name them so none is missed.
const CONFIG_DOCS = ['league', 'groupme', 'pod', 'parlay', 'groupmePoller']
// Rebuilt by import-history.mjs from the committed CSV — see the note above.
const SKIPPED = [
  'historyMatchups', 'historyTeamSeasons', 'historyPlayerSeasons',
  'historyPlayerWeeks', 'historyDrafts', 'historyAggregates',
]

const dryRun = process.argv.includes('--dry-run')
const token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim()
const headers = { Authorization: `Bearer ${token}` }

async function getJSON(url) {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`${res.status} ${url.replace(BASE, '')}: ${(await res.text()).slice(0, 160)}`)
  return res.json()
}

async function fetchCollection(name) {
  const docs = []
  let pageToken = ''
  do {
    const body = await getJSON(`${BASE}/${name}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`)
    for (const d of body.documents ?? []) {
      docs.push({ id: d.name.split('/').pop(), fields: d.fields ?? {} })
    }
    pageToken = body.nextPageToken ?? ''
  } while (pageToken)
  return docs
}

// ── Collect ───────────────────────────────────────────────────
const snapshot = { project: PROJECT, takenAt: new Date().toISOString(), skipped: SKIPPED, collections: {} }
let docCount = 0
const summary = []

for (const name of COLLECTIONS) {
  try {
    const docs = await fetchCollection(name)
    if (docs.length === 0) continue
    snapshot.collections[name] = docs
    docCount += docs.length
    summary.push([name, docs.length])
  } catch (e) {
    console.error(`  ! ${name}: ${e.message}`)
  }
}

snapshot.collections.config = []
for (const id of CONFIG_DOCS) {
  try {
    const d = await getJSON(`${BASE}/config/${id}`)
    snapshot.collections.config.push({ id, fields: d.fields ?? {} })
    docCount += 1
  } catch {
    // A config doc that doesn't exist is normal, not an error.
  }
}
summary.push(['config', snapshot.collections.config.length])

// config/league is the one document whose loss locks everyone out. Fail loudly
// rather than write a snapshot that quietly lacks it.
const league = snapshot.collections.config.find((d) => d.id === 'league')
if (!league?.fields?.userTeamMap) {
  console.error('ABORT: config/league missing or has no userTeamMap — refusing to write a snapshot that would restore an unusable league.')
  process.exit(1)
}

const json = JSON.stringify(snapshot)
const gz = gzipSync(Buffer.from(json), { level: 9 })

console.log(`Snapshot: ${docCount} docs across ${summary.length} collections`)
for (const [n, c] of summary.sort((a, b) => b[1] - a[1])) console.log(`  ${n.padEnd(22)} ${c}`)
console.log(`Raw ${(json.length / 1024).toFixed(0)} KiB → gzipped ${(gz.length / 1024).toFixed(0)} KiB`)
console.log(`Skipped (rebuildable from data/iffl_fantasy_history_2008-2025.csv): ${SKIPPED.join(', ')}`)

if (dryRun) {
  console.log('\nDRY RUN — nothing written.')
  process.exit(0)
}

// ── Write ─────────────────────────────────────────────────────
const stamp = snapshot.takenAt.slice(0, 10)
const file = `firestore-backup-${stamp}.json.gz`

const targets = [join(process.cwd(), '..', 'data', 'backup')]
// iCloud Drive gives an off-machine copy that stays private — the repo is
// public, so these snapshots can never live in git.
const icloud = join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'IFFL-Backups')
if (existsSync(join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs'))) targets.push(icloud)

for (const dir of targets) {
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, file), gz)
    // Prune oldest, keeping the most recent KEEP snapshots.
    const old = readdirSync(dir)
      .filter((f) => /^firestore-backup-.*\.json\.gz$/.test(f))
      .sort()
      .slice(0, -KEEP)
    for (const f of old) unlinkSync(join(dir, f))
    const kept = readdirSync(dir).filter((f) => /^firestore-backup-.*\.json\.gz$/.test(f)).length
    console.log(`✓ ${join(dir, file)} (${(statSync(join(dir, file)).size / 1024).toFixed(0)} KiB, ${kept} kept${old.length ? `, ${old.length} pruned` : ''})`)
  } catch (e) {
    console.error(`  ! could not write to ${dir}: ${e.message}`)
  }
}
