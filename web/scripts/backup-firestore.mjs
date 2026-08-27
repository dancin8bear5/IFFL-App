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
// WHERE IT WRITES
//
// The NAS only: /Volumes/homes/jaredrogtaylor/Backups/IFFL (SMB share on
// 192.168.1.124). Not the Mac, not iCloud.
//
// It will NOT fall back to a local path when the NAS is unreachable. If
// /Volumes/homes isn't a live mount, writing to that path would silently
// create an ordinary local folder that looks exactly like a successful
// backup and would vanish the moment the share mounted over it. The script
// verifies the destination is a real network mount and exits non-zero
// otherwise, so a failed week is visible instead of imaginary.
//
// The snapshots must never be committed either way: the GitHub repo is
// PUBLIC, and config/league holds every member's real email address and
// Firebase UID.
//
// Auth: `gcloud auth print-access-token` — the commissioner's own login. No
// service-account key exists on this machine.
//
// Usage:
//   node scripts/backup-firestore.mjs            # write a snapshot
//   node scripts/backup-firestore.mjs --dry-run  # report only
import { execSync } from 'node:child_process'
import { gzipSync, gunzipSync } from 'node:zlib'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, statSync } from 'node:fs'
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

// The NAS share must be genuinely mounted. `mount` is the authority here —
// existsSync() would happily return true for a local directory sitting at the
// mountpoint, which is the exact failure this guards against.
const NAS_MOUNT = '/Volumes/homes'
const dir = `${NAS_MOUNT}/jaredrogtaylor/Backups/IFFL`

const mounts = execSync('/sbin/mount', { encoding: 'utf8' })
const mountLine = mounts.split('\n').find((l) => l.includes(` on ${NAS_MOUNT} `))
if (!mountLine || !/smbfs|afpfs|nfs/.test(mountLine)) {
  console.error(`ABORT: ${NAS_MOUNT} is not a mounted network share — no backup written.`)
  console.error('  Mount it in Finder (Go → Connect to Server → smb://192.168.1.124) and re-run:')
  console.error('  bash ~/claude-agents/apps/iffl-web-app/ops/weekly-backup.sh')
  process.exit(2)
}

try {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, file), gz)

  // Read the file back and verify it decompresses to the same document count.
  // A truncated write over SMB is a real possibility, and a corrupt archive
  // that nobody opens until restore day is worse than no archive at all.
  const readBack = gunzipSync(readFileSync(join(dir, file)))
  const parsed = JSON.parse(readBack.toString())
  const back = Object.values(parsed.collections).reduce((a, v) => a + v.length, 0)
  if (back !== docCount) throw new Error(`verify failed: wrote ${docCount} docs, read back ${back}`)

  // Prune oldest, keeping the most recent KEEP snapshots.
  const old = readdirSync(dir)
    .filter((f) => /^firestore-backup-.*\.json\.gz$/.test(f))
    .sort()
    .slice(0, -KEEP)
  for (const f of old) unlinkSync(join(dir, f))
  const kept = readdirSync(dir).filter((f) => /^firestore-backup-.*\.json\.gz$/.test(f)).length

  console.log(`✓ ${join(dir, file)} (${(statSync(join(dir, file)).size / 1024).toFixed(0)} KiB)`)
  console.log(`  verified: ${back} docs read back · ${kept} snapshots kept${old.length ? `, ${old.length} pruned` : ''}`)
} catch (e) {
  console.error(`ABORT: write to NAS failed: ${e.message}`)
  process.exit(1)
}
