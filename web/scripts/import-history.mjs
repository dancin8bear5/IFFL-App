#!/usr/bin/env node
// import-history.mjs — one-time import of the full ESPN league history export
// (iffl_fantasy_history_2008-2025.csv) into Firestore.
//
// What it writes (all doc ids are the season year unless noted):
//   historyTeamSeasons/{year}   { season, teams: [{espnTeamId, espnName, team, finalRank,
//                                 playoffSeed, wins, losses, ties, pointsFor, pointsAgainst}] }
//   historyMatchups/{year}      { season, rows: [{week, team, opponent, points, oppPoints,
//                                 margin, result, benchPoints}] }  (one row per team per game)
//   historyPlayerSeasons/{year} { season, rows: [{team, playerId, player, position, proTeam,
//                                 points, avg, games, posRank, high, low, weeksTracked, finalSlot}] }
//   historyPlayerWeeks/{year}-{WW}  { season, week, rows: [{team, playerId, player, position,
//                                 proTeam, slot, status, points}] }  (2018+ only — ESPN kept
//                                 no weekly player lines before then)
//   historyDrafts/{year}        { season, picks: [...], keeperRoundPicks: [...] }
//   weeklyScores/{year}         { season, weeks: {"1": [{teamName, points}], ...}, records }
//                                 — the app's existing format, so historical seasons light up
//                                 the same charts as the current one. Skipped if the doc
//                                 already has entered weeks (never clobbers POD-entered data).
//   leagueHistory/{year}        standings enriched with pointsFor / pointsAgainst / playoffSeed
//                                 (record string updated to the ESPN regular-season W-L-T).
//   leagueRecords/auto-*        computed record-book cards for the Trophy Room records wall
//                                 (fixed ids, so re-running replaces instead of duplicating).
//
// Team identity: the CSV knows teams as ESPN names + ESPN team ids; the app knows
// franchises by master name ('Jared', 'M. Zurek', former members like 'Eric').
// The bridge is the already-seeded leagueHistory standings: per season, ESPN's
// FinalRank is joined to the seeded `place`. Validated by champion/runner-up and
// record agreement; the resolved mapping is printed for review. 2008 (no seeded
// standings) borrows each ESPN slot's 2009 owner — correct for the known champion
// (slot 5 = M. Zurek) and printed so it can be eyeballed.
//
// Auth: uses `gcloud auth print-access-token` (the commissioner's logged-in
// gcloud account) against the Firestore REST API. No service key needed.
//
// Usage (from web/):
//   node scripts/import-history.mjs ~/Downloads/iffl_fantasy_history_2008-2025.csv --dry-run
//   node scripts/import-history.mjs ~/Downloads/iffl_fantasy_history_2008-2025.csv
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const PROJECT = 'iffl-auth'
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

const csvPath = process.argv[2]
const dryRun = process.argv.includes('--dry-run')
if (!csvPath) {
  console.error('usage: node scripts/import-history.mjs <csv path> [--dry-run]')
  process.exit(1)
}

// ── CSV parse (export has no quoting — verified: zero quote chars, uniform 40 cols) ──
const lines = readFileSync(csvPath, 'utf8').split(/\r?\n/).filter((l) => l.length > 0)
const header = lines[0].split(',')
const col = Object.fromEntries(header.map((h, i) => [h, i]))
const num = (s) => (s === '' || s == null ? null : Number(s))
const rows = lines.slice(1).map((l) => l.split(','))
const byType = {}
for (const r of rows) (byType[r[0]] ??= []).push(r)
const get = (r, name) => r[col[name]]
const seasonsOf = (list) => [...new Set(list.map((r) => Number(get(r, 'Season'))))].sort()

console.log('CSV rows by type:', Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length])))

// ── Firestore REST helpers ────────────────────────────────────
const token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim()
const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } }
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encodeValue(x)])) } }
}
function decodeValue(v) {
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('stringValue' in v) return v.stringValue
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decodeValue)
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decodeValue(x)]))
  return v
}

async function fetchCollection(name) {
  const out = []
  let pageToken = ''
  do {
    const res = await fetch(`${BASE}/${name}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`, { headers: authHeaders })
    if (!res.ok) throw new Error(`GET ${name}: ${res.status} ${await res.text()}`)
    const body = await res.json()
    for (const d of body.documents ?? []) {
      out.push({
        id: d.name.split('/').pop(),
        data: Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, decodeValue(v)])),
      })
    }
    pageToken = body.nextPageToken ?? ''
  } while (pageToken)
  return out
}

const pendingWrites = [] // {path, data} — full-document sets
function setDoc(path, data) {
  pendingWrites.push({ path, data })
}
async function flushWrites() {
  const BATCH = 10 // player-week docs are ~50KB each; stay far under the 10MB request cap
  for (let i = 0; i < pendingWrites.length; i += BATCH) {
    const chunk = pendingWrites.slice(i, i + BATCH)
    const body = {
      writes: chunk.map(({ path, data }) => ({
        update: {
          name: `projects/${PROJECT}/databases/(default)/documents/${path}`,
          fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encodeValue(v)])),
        },
      })),
    }
    const res = await fetch(`${BASE.replace('/documents', '')}/documents:commit`, {
      method: 'POST', headers: authHeaders, body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`commit failed at batch ${i / BATCH}: ${res.status} ${await res.text()}`)
    process.stdout.write(`  wrote ${Math.min(i + BATCH, pendingWrites.length)}/${pendingWrites.length}\r`)
  }
  console.log()
}

// ── 1. Team identity: espnTeamId → master franchise name, per season ──
const historyDocs = await fetchCollection('leagueHistory')
const seededBySeason = new Map(historyDocs.map((d) => [Number(d.data.season), d.data]))

const teamSeasons = byType.TeamSeason ?? []
const mapping = new Map() // season → Map(espnTeamId → {team, espnName})
const warnings = []

for (const season of seasonsOf(teamSeasons)) {
  const csvTeams = teamSeasons.filter((r) => Number(get(r, 'Season')) === season)
  const seeded = seededBySeason.get(season)
  const m = new Map()
  if (seeded?.standings?.length) {
    const byPlace = new Map(seeded.standings.map((s) => [Number(s.place), s]))
    for (const r of csvTeams) {
      const rank = Number(get(r, 'FinalRank'))
      const seed = byPlace.get(rank)
      if (!seed) { warnings.push(`${season}: no seeded standing for rank ${rank} (${get(r, 'TeamName')})`); continue }
      const csvRec = `${get(r, 'Wins')}-${get(r, 'Losses')}`
      if (seed.record && !String(seed.record).startsWith(csvRec)) {
        warnings.push(`${season}: rank ${rank} record mismatch — seeded ${seed.record} vs ESPN ${csvRec} (${seed.teamName} / ${get(r, 'TeamName').trim()})`)
      }
      m.set(Number(get(r, 'TeamId')), { team: seed.teamName, espnName: get(r, 'TeamName').trim() })
    }
    // Hard checks: ESPN final rank 1/2 must be the seeded champion/runner-up.
    const champ = [...m.entries()].find(([id]) =>
      csvTeams.some((r) => Number(get(r, 'TeamId')) === id && Number(get(r, 'FinalRank')) === 1))?.[1]?.team
    if (seeded.champion && champ && seeded.champion !== champ) {
      throw new Error(`${season}: seeded champion ${seeded.champion} but ESPN rank 1 mapped to ${champ} — mapping unsafe, aborting`)
    }
  }
  mapping.set(season, m)
}

// 2008 has no seeded standings: borrow each ESPN slot's 2009 owner (league slots
// are per-franchise). Sanity-anchored: slot 5 (2008 champion) must be M. Zurek.
{
  const m2009 = mapping.get(2009)
  const m = new Map()
  for (const r of teamSeasons.filter((x) => Number(get(x, 'Season')) === 2008)) {
    const id = Number(get(r, 'TeamId'))
    const owner = m2009.get(id)?.team ?? null
    if (!owner) warnings.push(`2008: slot ${id} (${get(r, 'TeamName')}) has no 2009 owner to borrow — left unmapped`)
    m.set(id, { team: owner ?? get(r, 'TeamName').trim(), espnName: get(r, 'TeamName').trim() })
  }
  if (m.get(5)?.team !== 'M. Zurek') throw new Error(`2008: slot 5 resolved to ${m.get(5)?.team}, expected champion M. Zurek — aborting`)
  mapping.set(2008, m)
}

console.log('\nResolved team identity per season (ESPN slot → franchise):')
for (const [season, m] of [...mapping.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${season}: ` + [...m.entries()].sort((a, b) => a[0] - b[0]).map(([id, t]) => `${id}=${t.team}`).join(', '))
}
if (warnings.length) {
  console.log('\nWarnings:')
  for (const w of warnings) console.log('  ⚠ ' + w)
}

const owner = (season, teamId) => mapping.get(season)?.get(Number(teamId))?.team ?? `ESPN#${teamId}`

// ── 2. historyTeamSeasons + leagueHistory enrichment + weeklyScores records ──
for (const season of seasonsOf(teamSeasons)) {
  const csvTeams = teamSeasons
    .filter((r) => Number(get(r, 'Season')) === season)
    .sort((a, b) => Number(get(a, 'FinalRank')) - Number(get(b, 'FinalRank')))

  const teams = csvTeams.map((r) => ({
    espnTeamId: Number(get(r, 'TeamId')),
    espnName: get(r, 'TeamName').trim(),
    team: owner(season, get(r, 'TeamId')),
    finalRank: num(get(r, 'FinalRank')),
    playoffSeed: num(get(r, 'PlayoffSeed')),
    wins: num(get(r, 'Wins')) ?? 0,
    losses: num(get(r, 'Losses')) ?? 0,
    ties: num(get(r, 'Ties')) ?? 0,
    pointsFor: num(get(r, 'PointsFor')),
    pointsAgainst: num(get(r, 'PointsAgainst')),
  }))
  setDoc(`historyTeamSeasons/${season}`, { season, source: 'espn-history-import', teams })

  // leagueHistory/{season}: keep champion/runnerUp/notableTrades, rebuild standings
  // rows with real points. Record becomes the ESPN regular-season W-L(-T).
  const seeded = seededBySeason.get(season) ?? { id: String(season), season }
  const standings = teams.map((t) => ({
    teamName: t.team,
    place: t.finalRank,
    record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ''}`,
    pointsFor: t.pointsFor != null ? Math.round(t.pointsFor * 100) / 100 : null,
    pointsAgainst: t.pointsAgainst != null ? Math.round(t.pointsAgainst * 100) / 100 : null,
    playoffSeed: t.playoffSeed,
  }))
  const doc = {
    id: String(season),
    season,
    champion: seeded.champion ?? (season === 2008 ? 'M. Zurek' : null),
    runnerUp: seeded.runnerUp ?? standings.find((s) => s.place === 2)?.teamName ?? null,
    notableTrades: seeded.notableTrades ?? [],
    standings,
  }
  setDoc(`leagueHistory/${season}`, doc)
}

// ── 3. historyMatchups + weeklyScores ─────────────────────────
const teamWeeks = byType.TeamWeek ?? []
const existingWeekly = new Map((await fetchCollection('weeklyScores')).map((d) => [d.id, d.data]))
for (const season of seasonsOf(teamWeeks)) {
  const rowsIn = teamWeeks.filter((r) => Number(get(r, 'Season')) === season)
  const out = rowsIn.map((r) => ({
    week: Number(get(r, 'Week')),
    team: owner(season, get(r, 'TeamId')),
    opponent: owner(season, get(r, 'OpponentTeamId')),
    points: num(get(r, 'TeamScore')),
    oppPoints: num(get(r, 'OpponentScore')),
    margin: num(get(r, 'Margin')) != null ? Math.round(num(get(r, 'Margin')) * 100) / 100 : null,
    result: get(r, 'Winner') || null, // W / L / T from the team's own perspective
    benchPoints: num(get(r, 'TeamBenchPoints')),
  })).sort((a, b) => a.week - b.week || String(a.team).localeCompare(String(b.team)))
  setDoc(`historyMatchups/${season}`, { season, source: 'espn-history-import', rows: out })

  // weeklyScores/{season} in the app's native format — but never overwrite a
  // season that already has POD-entered weeks.
  if (Object.keys(existingWeekly.get(String(season))?.weeks ?? {}).length > 0) {
    console.log(`  weeklyScores/${season} already has entered weeks — skipping`)
    continue
  }
  const weeks = {}
  for (const r of out) {
    if (r.points == null) continue
    ;(weeks[String(r.week)] ??= []).push({ teamName: r.team, points: r.points })
  }
  const records = {}
  for (const t of teamSeasons.filter((r) => Number(get(r, 'Season')) === season)) {
    records[owner(season, get(t, 'TeamId'))] = {
      wins: num(get(t, 'Wins')) ?? 0, losses: num(get(t, 'Losses')) ?? 0, ties: num(get(t, 'Ties')) ?? 0,
    }
  }
  setDoc(`weeklyScores/${season}`, { season, source: 'espn-history-import', weeks, records })
}

// ── 4. historyPlayerSeasons ───────────────────────────────────
for (const season of seasonsOf(byType.PlayerSeason ?? [])) {
  const out = (byType.PlayerSeason ?? [])
    .filter((r) => Number(get(r, 'Season')) === season)
    .map((r) => ({
      team: owner(season, get(r, 'TeamId')),
      playerId: get(r, 'PlayerId') || null,
      player: get(r, 'Player'),
      position: get(r, 'Position') || null,
      proTeam: get(r, 'ProTeam') || null,
      points: num(get(r, 'SeasonTotalPoints')),
      avg: num(get(r, 'SeasonAvgPoints')),
      games: num(get(r, 'GamesPlayed')),
      posRank: num(get(r, 'PositionalRank')),
      high: num(get(r, 'HighWeeklyScore')),
      low: num(get(r, 'LowWeeklyScore')),
      weeksTracked: num(get(r, 'WeeksOnRosterTracked')),
      finalSlot: get(r, 'FinalLineupSlot') || null,
    }))
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
  setDoc(`historyPlayerSeasons/${season}`, { season, source: 'espn-history-import', rows: out })
}

// ── 5. historyPlayerWeeks (2018+; one doc per season-week) ────
const playerWeeks = byType.PlayerWeek ?? []
for (const season of seasonsOf(playerWeeks)) {
  const inSeason = playerWeeks.filter((r) => Number(get(r, 'Season')) === season)
  const byWeek = {}
  for (const r of inSeason) (byWeek[get(r, 'Week')] ??= []).push(r)
  for (const [week, list] of Object.entries(byWeek)) {
    const out = list.map((r) => ({
      team: owner(season, get(r, 'TeamId')),
      playerId: get(r, 'PlayerId') || null,
      player: get(r, 'Player'),
      position: get(r, 'Position') || null,
      proTeam: get(r, 'ProTeam') || null,
      slot: get(r, 'LineupSlot') || null,
      status: get(r, 'Status') || null, // Starter / Bench / IR
      points: num(get(r, 'WeeklyPoints')),
    })).sort((a, b) => String(a.team).localeCompare(String(b.team)) || (b.points ?? 0) - (a.points ?? 0))
    setDoc(`historyPlayerWeeks/${season}-${String(week).padStart(2, '0')}`, {
      season, week: Number(week), source: 'espn-history-import', rows: out,
    })
  }
}

// ── 6. historyDrafts ──────────────────────────────────────────
const draftSeasons = new Set([...seasonsOf(byType.DraftPick ?? []), ...seasonsOf(byType.KeeperRoundPick ?? [])])
for (const season of [...draftSeasons].sort()) {
  const picks = (byType.DraftPick ?? [])
    .filter((r) => Number(get(r, 'Season')) === season)
    .map((r) => ({
      team: owner(season, get(r, 'TeamId')),
      playerId: get(r, 'PlayerId') || null,
      player: get(r, 'Player'),
      position: get(r, 'Position') || null,
      proTeam: get(r, 'ProTeam') || null,
      round: num(get(r, 'Round')),
      overallPick: num(get(r, 'OverallPick')),
      roundPick: num(get(r, 'RoundPick')),
      auctionPrice: num(get(r, 'AuctionPrice')),
      keeper: get(r, 'Keeper') === 'Y',
    }))
    .sort((a, b) => (a.overallPick ?? 999) - (b.overallPick ?? 999))
  const keeperRoundPicks = (byType.KeeperRoundPick ?? [])
    .filter((r) => Number(get(r, 'Season')) === season)
    .map((r) => ({
      team: owner(season, get(r, 'TeamId')),
      playerId: get(r, 'PlayerId') || null,
      player: get(r, 'Player'),
      position: get(r, 'Position') || null,
      proTeam: get(r, 'ProTeam') || null,
      auctionPrice: num(get(r, 'AuctionPrice')),
      inferredDraftRound: num(get(r, 'InferredDraftRound')),
    }))
  setDoc(`historyDrafts/${season}`, { season, source: 'espn-history-import', picks, keeperRoundPicks })
}

// ── 7. leagueRecords — computed record-book cards (fixed ids) ──
{
  const games = teamWeeks.map((r) => {
    const season = Number(get(r, 'Season'))
    return {
      season,
      week: Number(get(r, 'Week')),
      team: owner(season, get(r, 'TeamId')),
      opponent: owner(season, get(r, 'OpponentTeamId')),
      pts: num(get(r, 'TeamScore')),
      opp: num(get(r, 'OpponentScore')),
      result: get(r, 'Winner'),
    }
  }).filter((g) => g.pts != null && g.opp != null)

  const fmt = (n) => (Math.round(n * 100) / 100).toString()
  const best = (list, score) => list.reduce((a, b) => (score(b) > score(a) ? b : a))
  const rec = (id, fields) => setDoc(`leagueRecords/${id}`, { source: 'espn-history-import', ...fields })
  const vs = (g) => `vs ${g.opponent} (${fmt(g.pts)}–${fmt(g.opp)})`

  const hi = best(games, (g) => g.pts)
  rec('auto-highest-single-game', { scope: 'game', label: 'Highest Single-Game Score', tone: 'high', team: hi.team, player: null, value: `${fmt(hi.pts)} pts`, detail: vs(hi), season: hi.season, week: hi.week, order: 1 })

  const lo = best(games, (g) => -g.pts)
  rec('auto-lowest-single-game', { scope: 'game', label: 'Lowest Single-Game Score', tone: 'low', team: lo.team, player: null, value: `${fmt(lo.pts)} pts`, detail: vs(lo), season: lo.season, week: lo.week, order: 2 })

  const wins = games.filter((g) => g.result === 'W')
  const blow = best(wins, (g) => g.pts - g.opp)
  rec('auto-biggest-blowout', { scope: 'game', label: 'Biggest Blowout', tone: 'high', team: blow.team, player: null, value: `+${fmt(blow.pts - blow.opp)}`, detail: vs(blow), season: blow.season, week: blow.week, order: 3 })

  const close = best(wins, (g) => -(g.pts - g.opp))
  rec('auto-closest-margin', { scope: 'game', label: 'Closest Margin', tone: 'high', team: close.team, player: null, value: `+${fmt(close.pts - close.opp)}`, detail: vs(close), season: close.season, week: close.week, order: 4 })

  const combo = best(games, (g) => g.pts + g.opp)
  rec('auto-most-combined', { scope: 'game', label: 'Most Combined Points', tone: 'high', team: combo.team, player: null, value: `${fmt(combo.pts + combo.opp)} pts`, detail: vs(combo), season: combo.season, week: combo.week, order: 5 })

  const losses = games.filter((g) => g.result === 'L')
  const hiLoss = best(losses, (g) => g.pts)
  rec('auto-highest-score-loss', { scope: 'game', label: 'Highest Score in a Loss', tone: 'low', team: hiLoss.team, player: null, value: `${fmt(hiLoss.pts)} pts`, detail: vs(hiLoss), season: hiLoss.season, week: hiLoss.week, order: 6 })

  const loWin = best(wins, (g) => -g.pts)
  rec('auto-lowest-score-win', { scope: 'game', label: 'Lowest Score in a Win', tone: 'high', team: loWin.team, player: null, value: `${fmt(loWin.pts)} pts`, detail: vs(loWin), season: loWin.season, week: loWin.week, order: 7 })

  // Player records
  const started = playerWeeks
    .filter((r) => get(r, 'Status') === 'Starter' && num(get(r, 'WeeklyPoints')) != null)
    .map((r) => ({
      season: Number(get(r, 'Season')), week: Number(get(r, 'Week')),
      team: owner(Number(get(r, 'Season')), get(r, 'TeamId')),
      player: get(r, 'Player'), position: get(r, 'Position'), pts: num(get(r, 'WeeklyPoints')),
    }))
  if (started.length) {
    const pg = best(started, (p) => p.pts)
    rec('auto-best-player-game', { scope: 'player', label: 'Best Player Game', tone: 'high', team: pg.team, player: `${pg.player} (${pg.position})`, value: `${fmt(pg.pts)} pts`, detail: 'Started that week · weekly player data begins 2018', season: pg.season, week: pg.week, order: 1 })
  }

  const pSeasons = (byType.PlayerSeason ?? [])
    .filter((r) => num(get(r, 'SeasonTotalPoints')) != null)
    .map((r) => ({
      season: Number(get(r, 'Season')),
      team: owner(Number(get(r, 'Season')), get(r, 'TeamId')),
      player: get(r, 'Player'), position: get(r, 'Position'), pts: num(get(r, 'SeasonTotalPoints')),
    }))
  const ps = best(pSeasons, (p) => p.pts)
  rec('auto-most-season-points-player', { scope: 'player', label: 'Most Season Points (Player)', tone: 'high', team: ps.team, player: `${ps.player} (${ps.position})`, value: `${fmt(ps.pts)} pts`, detail: 'Best single-season player total on a roster', season: ps.season, week: null, order: 2 })
}

// ── Go ────────────────────────────────────────────────────────
console.log(`\nPrepared ${pendingWrites.length} document writes.`)
const byCol = {}
for (const w of pendingWrites) {
  const c = w.path.split('/')[0]
  byCol[c] = (byCol[c] ?? 0) + 1
}
console.log('By collection:', byCol)
const biggest = pendingWrites.reduce((a, b) => (JSON.stringify(b.data).length > JSON.stringify(a.data).length ? b : a))
console.log(`Largest doc: ${biggest.path} ≈ ${(JSON.stringify(biggest.data).length / 1024).toFixed(0)}KB (Firestore limit 1MB)`)

if (dryRun) {
  console.log('\nDRY RUN — nothing written. Re-run without --dry-run to import.')
} else {
  await flushWrites()
  console.log('Import complete.')
}
