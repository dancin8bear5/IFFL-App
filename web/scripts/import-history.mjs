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
import { weekRegret } from '../src/services/lineupOptimizer.js'

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

// ── 6b. historyAggregates — precomputed chart feeds ───────────
// The scoring, draft-spend and draft-ROI charts each need a join across
// every season's drafts AND player seasons. Doing that in the browser would
// mean pulling ~1MB across 36 documents to render three charts. These two
// small docs (a few KB each) carry the finished numbers instead.
{
  // Scoring by season: per-team PPG plus the league average that year, so a
  // franchise can be read against the era it played in.
  const scoringSeasons = []
  for (const season of seasonsOf(teamSeasons)) {
    const teams = teamSeasons
      .filter((r) => Number(get(r, 'Season')) === season)
      .map((r) => {
        const w = num(get(r, 'Wins')) ?? 0, l = num(get(r, 'Losses')) ?? 0, t = num(get(r, 'Ties')) ?? 0
        const pf = num(get(r, 'PointsFor'))
        const games = w + l + t
        return {
          team: owner(season, get(r, 'TeamId')),
          pointsFor: pf != null ? Math.round(pf * 100) / 100 : null,
          games,
          ppg: pf != null && games > 0 ? Math.round((pf / games) * 100) / 100 : null,
        }
      })
      .filter((x) => x.ppg != null)
    if (!teams.length) continue
    const avg = teams.reduce((a, x) => a + x.ppg, 0) / teams.length
    scoringSeasons.push({ season, leagueAvgPPG: Math.round(avg * 100) / 100, teams })
  }
  setDoc('historyAggregates/scoring', { source: 'espn-history-import', seasons: scoringSeasons })

  // Draft economics. Position labels in the export carry a little junk:
  // PK is ESPN's older name for K, and '-' / 'FB' are a handful of rows that
  // aren't real fantasy positions.
  const POS_FIX = { PK: 'K' }
  const POS_DROP = new Set(['-', 'FB', ''])
  const normPos = (p) => POS_FIX[p] ?? p

  // ROI needs each pick's season points ON THE TEAM THAT DRAFTED HIM.
  const ptsByKey = new Map()
  for (const r of byType.PlayerSeason ?? []) {
    const pts = num(get(r, 'SeasonTotalPoints'))
    if (pts != null) ptsByKey.set(`${get(r, 'Season')}|${get(r, 'TeamId')}|${get(r, 'PlayerId')}`, pts)
  }

  const positionSpend = []
  const roi = []
  for (const season of seasonsOf(byType.DraftPick ?? [])) {
    const picks = (byType.DraftPick ?? []).filter((r) => Number(get(r, 'Season')) === season)

    const byPosition = {}
    let total = 0
    for (const r of picks) {
      const pos = normPos(get(r, 'Position'))
      const price = num(get(r, 'AuctionPrice'))
      if (POS_DROP.has(pos) || price == null) continue
      byPosition[pos] = (byPosition[pos] ?? 0) + price
      total += price
    }
    if (total > 0) positionSpend.push({ season, total, byPosition })

    const byTeam = new Map()
    for (const r of picks) {
      const price = num(get(r, 'AuctionPrice'))
      if (price == null || price <= 0) continue
      const team = owner(season, get(r, 'TeamId'))
      const pts = ptsByKey.get(`${get(r, 'Season')}|${get(r, 'TeamId')}|${get(r, 'PlayerId')}`) ?? 0
      const t = byTeam.get(team) ?? { team, spend: 0, points: 0, picks: 0 }
      t.spend += price
      t.points += pts
      t.picks += 1
      byTeam.set(team, t)
    }
    for (const t of byTeam.values()) {
      roi.push({
        season, team: t.team, picks: t.picks,
        spend: Math.round(t.spend * 100) / 100,
        points: Math.round(t.points * 100) / 100,
        ptsPerDollar: t.spend > 0 ? Math.round((t.points / t.spend) * 100) / 100 : null,
      })
    }
  }
  setDoc('historyAggregates/draft', { source: 'espn-history-import', positionSpend, roi })

  // ── Lineups: bench regret + roster DNA (2018+) ──────────────
  // Solving the best-possible lineup is an assignment problem per team-week,
  // so it runs here once rather than in every browser that opens the room.
  const pwByTeamWeek = new Map()
  for (const r of playerWeeks) {
    const season = Number(get(r, 'Season'))
    const key = `${season}|${get(r, 'Week')}|${get(r, 'TeamId')}`
    if (!pwByTeamWeek.has(key)) pwByTeamWeek.set(key, [])
    pwByTeamWeek.get(key).push({
      player: get(r, 'Player'),
      position: get(r, 'Position'),
      slot: get(r, 'LineupSlot'),
      status: get(r, 'Status'),
      points: num(get(r, 'WeeklyPoints')),
    })
  }

  // Official score and result for the same team-week, to say whether a perfect
  // lineup would have flipped the game.
  const officialByKey = new Map()
  for (const r of teamWeeks) {
    officialByKey.set(`${Number(get(r, 'Season'))}|${get(r, 'Week')}|${get(r, 'TeamId')}`, {
      pts: num(get(r, 'TeamScore')), opp: num(get(r, 'OpponentScore')),
    })
  }

  const lineupRows = []
  const dna = new Map()
  for (const [key, rows] of pwByTeamWeek) {
    const [seasonStr, weekStr, teamId] = key.split('|')
    const season = Number(seasonStr)
    const team = owner(season, teamId)
    const r = weekRegret(rows)
    if (!r) continue

    const official = officialByKey.get(key)
    // A loss "flips" when the points left on the bench cover the deficit.
    const lost = official?.pts != null && official?.opp != null && official.pts < official.opp
    const flipped = lost && official.pts + r.regret > official.opp

    lineupRows.push({
      season, week: Number(weekStr), team,
      started: r.started, optimal: r.optimal, regret: r.regret,
      flipped: Boolean(flipped),
    })

    // Roster DNA counts STARTER points only — what a team leaned on.
    for (const row of rows) {
      if (row.status !== 'Starter' || row.points == null) continue
      const d = dna.get(team) ?? { team, total: 0, byPosition: {} }
      d.byPosition[row.position] = (d.byPosition[row.position] ?? 0) + row.points
      d.total += row.points
      dna.set(team, d)
    }
  }

  lineupRows.sort((a, b) => a.season - b.season || a.week - b.week || a.team.localeCompare(b.team))
  const positionShare = [...dna.values()].map((d) => ({
    team: d.team,
    total: Math.round(d.total * 100) / 100,
    byPosition: Object.fromEntries(Object.entries(d.byPosition).map(([k, v]) => [k, Math.round(v * 100) / 100])),
  }))
  const firstLineupSeason = lineupRows.length ? Math.min(...lineupRows.map((r) => r.season)) : null
  setDoc('historyAggregates/lineups', {
    source: 'espn-history-import',
    sinceSeason: firstLineupSeason,
    rows: lineupRows,
    positionShare,
  })

  // Worst lineup decision ever — the single week a perfect lineup would have
  // changed the most. Deferred to Phase 3 because it needs the solver above.
  if (lineupRows.length) {
    const activeOwners2 = new Set([...mapping.get(2025).values()].map((t) => t.team))
    const pool = lineupRows.filter((r) => activeOwners2.has(r.team))
    const worst = (pool.length ? pool : lineupRows).reduce((a, b) => (b.regret > a.regret ? b : a))
    const off = officialByKey.get(`${worst.season}|${worst.week}|${
      [...(mapping.get(worst.season) ?? new Map()).entries()].find(([, v]) => v.team === worst.team)?.[0] ?? ''}`)
    const lostIt = off?.pts != null && off?.opp != null && off.pts < off.opp
    setDoc('leagueRecords/auto-worst-lineup-decision', {
      source: 'espn-history-import',
      scope: 'player', label: 'Worst Lineup Decision', tone: 'low',
      team: worst.team, player: null,
      value: `${Math.round(worst.regret * 100) / 100} pts left behind`,
      detail: `started ${worst.started}, best lineup was ${worst.optimal}${lostIt ? ` — and lost ${off.pts}–${off.opp}` : ''} · tracked since ${firstLineupSeason}`,
      season: worst.season, week: worst.week, order: 7,
    })
  }
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

  // The Trophy Room hides any record card whose holder has left the league, so
  // a mark held by a former member would make the whole card disappear rather
  // than read as history. Every record therefore names the best CURRENT member
  // and, when a departed one did better, says so in the detail line.
  const activeOwners = new Set([...mapping.get(2025).values()].map((t) => t.team))
  const bestWithFormerNote = (list, score, describe) => {
    const overall = best(list, score)
    const current = list.filter((x) => activeOwners.has(x.team))
    const held = current.length ? best(current, score) : overall
    const note = held !== overall ? ` — all-time: ${describe(overall)} (former member)` : ''
    return { held, note }
  }

  const gameNote = (g, val) => `${g.team} ${val} (${g.season})`

  const { held: hi, note: hiN } = bestWithFormerNote(games, (g) => g.pts, (g) => gameNote(g, `${fmt(g.pts)} pts`))
  rec('auto-highest-single-game', { scope: 'game', label: 'Highest Single-Game Score', tone: 'high', team: hi.team, player: null, value: `${fmt(hi.pts)} pts`, detail: vs(hi) + hiN, season: hi.season, week: hi.week, order: 1 })

  const { held: lo, note: loN } = bestWithFormerNote(games, (g) => -g.pts, (g) => gameNote(g, `${fmt(g.pts)} pts`))
  rec('auto-lowest-single-game', { scope: 'game', label: 'Lowest Single-Game Score', tone: 'low', team: lo.team, player: null, value: `${fmt(lo.pts)} pts`, detail: vs(lo) + loN, season: lo.season, week: lo.week, order: 2 })

  // Margin records derive win/loss from the SCORES, not ESPN's Winner flag.
  // Seven playoff-week rows in the export carry Winner=W on the lower score
  // (bracket bookkeeping), and a "closest win" card computed from those comes
  // out with a negative margin. A record about scoring has to agree with the
  // scoreboard. Streaks and the rivalry grid still use ESPN's official verdict,
  // since that is what the standings were built from.
  const wins = games.filter((g) => g.pts > g.opp)
  const { held: blow, note: blowN } = bestWithFormerNote(wins, (g) => g.pts - g.opp, (g) => gameNote(g, `+${fmt(g.pts - g.opp)}`))
  rec('auto-biggest-blowout', { scope: 'game', label: 'Biggest Blowout', tone: 'high', team: blow.team, player: null, value: `+${fmt(blow.pts - blow.opp)}`, detail: vs(blow) + blowN, season: blow.season, week: blow.week, order: 3 })

  const { held: close, note: closeN } = bestWithFormerNote(wins, (g) => -(g.pts - g.opp), (g) => gameNote(g, `+${fmt(g.pts - g.opp)}`))
  rec('auto-closest-margin', { scope: 'game', label: 'Closest Margin', tone: 'high', team: close.team, player: null, value: `+${fmt(close.pts - close.opp)}`, detail: vs(close) + closeN, season: close.season, week: close.week, order: 4 })

  const { held: combo, note: comboN } = bestWithFormerNote(games, (g) => g.pts + g.opp, (g) => gameNote(g, `${fmt(g.pts + g.opp)} pts`))
  rec('auto-most-combined', { scope: 'game', label: 'Most Combined Points', tone: 'high', team: combo.team, player: null, value: `${fmt(combo.pts + combo.opp)} pts`, detail: vs(combo) + comboN, season: combo.season, week: combo.week, order: 5 })

  const losses = games.filter((g) => g.pts < g.opp)
  const { held: hiLoss, note: hiLossN } = bestWithFormerNote(losses, (g) => g.pts, (g) => gameNote(g, `${fmt(g.pts)} pts`))
  rec('auto-highest-score-loss', { scope: 'game', label: 'Highest Score in a Loss', tone: 'low', team: hiLoss.team, player: null, value: `${fmt(hiLoss.pts)} pts`, detail: vs(hiLoss) + hiLossN, season: hiLoss.season, week: hiLoss.week, order: 6 })

  const { held: loWin, note: loWinN } = bestWithFormerNote(wins, (g) => -g.pts, (g) => gameNote(g, `${fmt(g.pts)} pts`))
  rec('auto-lowest-score-win', { scope: 'game', label: 'Lowest Score in a Win', tone: 'high', team: loWin.team, player: null, value: `${fmt(loWin.pts)} pts`, detail: vs(loWin) + loWinN, season: loWin.season, week: loWin.week, order: 7 })

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

  // ── Phase 1 additions — deeper game & player records ────────
  const regWeeksOf = (season) => (season >= 2021 ? 14 : 13)

  // Win/loss streaks: follow the OWNER through franchise-slot timelines,
  // playoffs included, spanning offseasons. A tie breaks either streak.
  const timeline = new Map()
  for (const g of games) {
    if (!timeline.has(g.team)) timeline.set(g.team, [])
    timeline.get(g.team).push(g)
  }
  const streaks = []
  for (const [team, list] of timeline) {
    list.sort((a, b) => a.season - b.season || a.week - b.week)
    for (const want of ['W', 'L']) {
      let len = 0, start = null
      const flush = (endG) => {
        if (len > 0) streaks.push({ team, type: want, len, start, end: endG })
      }
      let lastG = null
      for (const g of list) {
        if (g.result === want) {
          if (len === 0) start = g
          len += 1
          lastG = g
        } else {
          flush(lastG); len = 0; start = null
        }
      }
      flush(lastG)
    }
  }
  const streakSpan = (s) => `${s.start.season} wk ${s.start.week} → ${s.end.season} wk ${s.end.week}`
  const winStreaks = streaks.filter((s) => s.type === 'W')
  const { held: ws, note: wsNote } = bestWithFormerNote(winStreaks, (s) => s.len, (s) => `${s.team} ${s.len}`)
  rec('auto-longest-win-streak', { scope: 'game', label: 'Longest Win Streak', tone: 'high', team: ws.team, player: null, value: `${ws.len} straight`, detail: `${streakSpan(ws)}, playoffs included${wsNote}`, season: ws.end.season, week: null, order: 8 })
  const lossStreaks = streaks.filter((s) => s.type === 'L')
  const { held: ls, note: lsNote } = bestWithFormerNote(lossStreaks, (s) => s.len, (s) => `${s.team} ${s.len}`)
  rec('auto-longest-losing-streak', { scope: 'game', label: 'Longest Losing Streak', tone: 'low', team: ls.team, player: null, value: `${ls.len} straight`, detail: `${streakSpan(ls)}, playoffs included${lsNote}`, season: ls.end.season, week: null, order: 9 })

  // Season scoring extremes — PPG-normalized where eras differ (13 vs 14 games).
  const tSeasons = teamSeasons.map((r) => {
    const season = Number(get(r, 'Season'))
    const w = num(get(r, 'Wins')) ?? 0, l = num(get(r, 'Losses')) ?? 0, t = num(get(r, 'Ties')) ?? 0
    return {
      season, team: owner(season, get(r, 'TeamId')),
      w, l, t, games: w + l + t,
      pf: num(get(r, 'PointsFor')), pa: num(get(r, 'PointsAgainst')),
      rank: num(get(r, 'FinalRank')), seed: num(get(r, 'PlayoffSeed')),
    }
  }).filter((x) => x.pf != null && x.games > 0)
  const record = (x) => `${x.w}-${x.l}${x.t ? `-${x.t}` : ''}`

  const pfBest = best(tSeasons, (x) => x.pf)
  rec('auto-most-points-season', { scope: 'game', label: 'Most Points in a Season', tone: 'high', team: pfBest.team, player: null, value: `${fmt(pfBest.pf)} pts`, detail: `${fmt(pfBest.pf / pfBest.games)} per game · went ${record(pfBest)}${pfBest.rank === 1 ? ', won the belt' : ''}`, season: pfBest.season, week: null, order: 10 })
  const ppgWorst = best(tSeasons, (x) => -(x.pf / x.games))
  rec('auto-fewest-points-season', { scope: 'game', label: 'Fewest Points in a Season', tone: 'low', team: ppgWorst.team, player: null, value: `${fmt(ppgWorst.pf / ppgWorst.games)} per game`, detail: `${fmt(ppgWorst.pf)} total · went ${record(ppgWorst)} (per-game, so 13- and 14-game eras compare fairly)`, season: ppgWorst.season, week: null, order: 11 })
  const paBest = best(tSeasons, (x) => x.pa)
  rec('auto-most-points-against', { scope: 'game', label: 'Punching Bag (Most Points Against)', tone: 'low', team: paBest.team, player: null, value: `${fmt(paBest.pa)} pts against`, detail: `Everyone's best week came against them · went ${record(paBest)}`, season: paBest.season, week: null, order: 12 })

  // Narrowest championship — the final is rank 1 vs rank 2 in the postseason;
  // 2009 and 2010 were two-week aggregate finals, so meetings are summed.
  const finals = []
  for (const [season, m] of mapping) {
    const rows = tSeasons.filter((x) => x.season === season)
    const champ = rows.find((x) => x.rank === 1), ru = rows.find((x) => x.rank === 2)
    if (!champ || !ru) continue
    const meetings = games.filter((g) =>
      g.season === season && g.week > regWeeksOf(season) && g.team === champ.team && g.opponent === ru.team)
    if (!meetings.length) continue
    const margin = meetings.reduce((a, g) => a + (g.pts - g.opp), 0)
    finals.push({ season, champ: champ.team, ru: ru.team, champSeed: champ.seed, ruSeed: ru.seed, margin, legs: meetings.length })
  }
  const narrow = best(finals.filter((f) => f.margin > 0), (f) => -f.margin)
  rec('auto-narrowest-championship', { scope: 'game', label: 'Narrowest Championship', tone: 'high', team: narrow.champ, player: null, value: `won the final by ${fmt(narrow.margin)}`, detail: `beat ${narrow.ru}${narrow.legs > 1 ? ' (two-week aggregate final)' : ''}`, season: narrow.season, week: null, order: 13 })

  // Cinderella run — worst playoff seed ever to reach (or win) the final.
  const cindy = best(
    finals.flatMap((f) => [
      { season: f.season, team: f.champ, seed: f.champSeed, won: true },
      { season: f.season, team: f.ru, seed: f.ruSeed, won: false },
    ]).filter((x) => x.seed != null),
    (x) => x.seed * 2 + (x.won ? 1 : 0), // deepest seed wins; a title breaks the tie
  )
  rec('auto-cinderella-run', { scope: 'game', label: 'Cinderella Run', tone: 'high', team: cindy.team, player: null, value: `${cindy.seed}-seed → ${cindy.won ? 'champion' : 'the final'}`, detail: 'Lowest playoff seed ever to reach the championship game', season: cindy.season, week: null, order: 14 })

  // Best season that didn't win the belt.
  const noBelt = tSeasons.filter((x) => x.rank !== 1)
  const { held: nb, note: nbNote } = bestWithFormerNote(noBelt, (x) => (x.w + x.t * 0.5) / x.games, (x) => `${x.team} ${record(x)} (${x.season})`)
  rec('auto-best-season-no-belt', { scope: 'game', label: 'Best Season Without the Belt', tone: 'low', team: nb.team, player: null, value: record(nb), detail: `finished #${nb.rank}${nbNote}`, season: nb.season, week: null, order: 15 })

  // Most league-best weeks in one regular season (ties at the top all count).
  const highCounts = new Map()
  const bySeasonWeek = new Map()
  for (const g of games) {
    if (g.week > regWeeksOf(g.season)) continue
    const k = `${g.season}|${g.week}`
    if (!bySeasonWeek.has(k)) bySeasonWeek.set(k, [])
    bySeasonWeek.get(k).push(g)
  }
  for (const list of bySeasonWeek.values()) {
    const top = Math.max(...list.map((g) => g.pts))
    for (const g of list.filter((x) => x.pts === top)) {
      const k = `${g.season}|${g.team}`
      highCounts.set(k, (highCounts.get(k) ?? 0) + 1)
    }
  }
  const highRows = [...highCounts.entries()].map(([k, n]) => {
    const [season, team] = k.split('|')
    return { season: Number(season), team, n }
  })
  const topHigh = Math.max(...highRows.map((x) => x.n))
  const highHolders = highRows.filter((x) => x.n === topHigh).sort((a, b) => a.season - b.season)
  const hh = highHolders.find((x) => activeOwners.has(x.team)) ?? highHolders[0]
  rec('auto-most-weekly-highs', { scope: 'game', label: 'Most Weekly High Scores, Season', tone: 'high', team: hh.team, player: null, value: `${hh.n} league-best weeks`, detail: highHolders.length > 1 ? `shared record: ${highHolders.map((x) => `${x.team} '${String(x.season).slice(2)}`).join(', ')}` : 'league-best score in a regular-season week', season: hh.season, week: null, order: 16 })

  // ── Player wall: draft economics + bench heartbreak ─────────
  // Join draft picks to that team's PlayerSeason row for the same season.
  const seasonPts = new Map() // `${season}|${teamId}|${playerId}` → pts
  const playerAnyRow = new Set() // `${season}|${playerId}` — scored on any roster
  for (const r of byType.PlayerSeason ?? []) {
    const pts = num(get(r, 'SeasonTotalPoints'))
    if (pts == null) continue
    seasonPts.set(`${get(r, 'Season')}|${get(r, 'TeamId')}|${get(r, 'PlayerId')}`, pts)
    playerAnyRow.add(`${get(r, 'Season')}|${get(r, 'PlayerId')}`)
  }
  const draftJoin = (byType.DraftPick ?? []).map((r) => {
    const season = Number(get(r, 'Season'))
    return {
      season, team: owner(season, get(r, 'TeamId')),
      player: get(r, 'Player'), position: get(r, 'Position'),
      price: num(get(r, 'AuctionPrice')), keeper: get(r, 'Keeper') === 'Y',
      pts: seasonPts.get(`${get(r, 'Season')}|${get(r, 'TeamId')}|${get(r, 'PlayerId')}`) ?? null,
      scoredAnywhere: playerAnyRow.has(`${get(r, 'Season')}|${get(r, 'PlayerId')}`),
    }
  })

  const bargains = draftJoin.filter((d) => !d.keeper && d.price >= 1 && d.pts != null && d.pts >= 100)
  const bg = best(bargains, (d) => d.pts / d.price)
  rec('auto-best-draft-bargain', { scope: 'player', label: 'Best Draft Bargain', tone: 'high', team: bg.team, player: `${bg.player} (${bg.position})`, value: `$${bg.price} → ${fmt(bg.pts)} pts`, detail: `${fmt(bg.pts / bg.price)} points per auction dollar`, season: bg.season, week: null, order: 3 })

  // Bust: $40+ at the draft, fewest points ON THAT ROSTER. A pick with no
  // stats row anywhere that season truly never scored (e.g. a holdout) and
  // counts as 0; one who scored on another roster just moved — not a bust.
  const busts = draftJoin
    .filter((d) => d.price >= 40 && (d.pts != null || !d.scoredAnywhere))
    .map((d) => ({ ...d, pts: d.pts ?? 0 }))
  const bust = best(busts, (d) => -(d.pts - d.price / 1000)) // price breaks 0-pt ties
  rec('auto-biggest-bust', { scope: 'player', label: 'Biggest Bust', tone: 'low', team: bust.team, player: `${bust.player} (${bust.position})`, value: `$${bust.price} → ${fmt(bust.pts)} pts`, detail: bust.pts === 0 ? 'Never scored a point all season' : 'Fewest points by a $40+ pick', season: bust.season, week: null, order: 4 })

  // Bench heartbreak (2018+ — no weekly player data before then).
  const benchWeeks = teamWeeks
    .map((r) => ({
      season: Number(get(r, 'Season')), week: Number(get(r, 'Week')),
      team: owner(Number(get(r, 'Season')), get(r, 'TeamId')),
      opponent: owner(Number(get(r, 'Season')), get(r, 'OpponentTeamId')),
      bench: num(get(r, 'TeamBenchPoints')), pts: num(get(r, 'TeamScore')), opp: num(get(r, 'OpponentScore')), result: get(r, 'Winner'),
    }))
    .filter((x) => x.bench != null)
  if (benchWeeks.length) {
    const bw = best(benchWeeks, (x) => x.bench)
    rec('auto-most-bench-points-week', { scope: 'player', label: 'Most Points Left on Bench (Week)', tone: 'low', team: bw.team, player: null, value: `${fmt(bw.bench)} bench pts`, detail: `${bw.result === 'W' ? 'won' : bw.result === 'L' ? 'lost' : 'tied'} ${fmt(bw.pts)}–${fmt(bw.opp)} vs ${bw.opponent} anyway · tracked since 2018`, season: bw.season, week: bw.week, order: 5 })
  }
  const benched = playerWeeks
    .filter((r) => get(r, 'Status') === 'Bench' && num(get(r, 'WeeklyPoints')) != null)
    .map((r) => ({
      season: Number(get(r, 'Season')), week: Number(get(r, 'Week')),
      team: owner(Number(get(r, 'Season')), get(r, 'TeamId')),
      player: get(r, 'Player'), position: get(r, 'Position'), pts: num(get(r, 'WeeklyPoints')),
    }))
  if (benched.length) {
    const bb = best(benched, (x) => x.pts)
    rec('auto-best-bench-game', { scope: 'player', label: 'Best Game Left on the Bench', tone: 'low', team: bb.team, player: `${bb.player} (${bb.position})`, value: `${fmt(bb.pts)} pts on the bench`, detail: 'Biggest game a player had while riding the pine · tracked since 2018', season: bb.season, week: bb.week, order: 6 })
  }
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
  console.log('\nRecord cards:')
  for (const w of pendingWrites.filter((x) => x.path.startsWith('leagueRecords/'))) {
    const d = w.data
    console.log(`  [${d.scope}] ${d.label}: ${[d.team, d.player, d.value].filter(Boolean).join(' — ')} (${[d.season, d.week ? `wk ${d.week}` : null].filter(Boolean).join(' ')})`)
    if (d.detail) console.log(`        ${d.detail}`)
  }
  console.log('\nDRY RUN — nothing written. Re-run without --dry-run to import.')
} else {
  await flushWrites()
  console.log('Import complete.')
}
