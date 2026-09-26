// leagueStats — all-time career stats computed from the leagueHistory
// collection. Powers the League History sortable table and the Trophy Room.
import { isActiveTeam, teamByName, PLAYOFF_TEAMS } from '../data/staticData.js'

/** Parse "11-3" or "10-3-1" record strings → {w, l, t}. Null-safe. */
export function parseRecord(record) {
  if (!record || typeof record !== 'string') return { w: 0, l: 0, t: 0 }
  const parts = record.split('-').map((n) => parseInt(n, 10))
  return {
    w: Number.isFinite(parts[0]) ? parts[0] : 0,
    l: Number.isFinite(parts[1]) ? parts[1] : 0,
    t: Number.isFinite(parts[2]) ? parts[2] : 0,
  }
}

// Top 8 of 12 make the playoffs (2025 League Document §League Playoffs)
export const PLAYOFF_CUTOFF = PLAYOFF_TEAMS

/**
 * Compute career rows for every team present in history.
 * Columns: seasons, w, l, t, pct, pointsFor (null if no data), championships,
 * runnerUps, finals, top3, top5, playoffs, bestFinish, avgFinish, lastFinish.
 */
export function computeAllTimeStats(history) {
  const rows = new Map()

  const row = (team) => {
    if (!rows.has(team)) {
      rows.set(team, {
        team,
        seasons: 0, w: 0, l: 0, t: 0,
        pointsFor: 0, hasPoints: false,
        championships: 0, runnerUps: 0, finals: 0,
        top3: 0, top5: 0, playoffs: 0,
        bestFinish: null, finishSum: 0, lastFinish: null, lastSeason: null,
        finishes: [], // {season, place, record}
      })
    }
    return rows.get(team)
  }

  for (const season of history) {
    for (const s of season.standings ?? []) {
      const r = row(s.teamName)
      r.seasons += 1
      const rec = parseRecord(s.record)
      r.w += rec.w; r.l += rec.l; r.t += rec.t
      if (s.pointsFor != null) {
        r.pointsFor += s.pointsFor
        r.hasPoints = true
      }
      if (s.place <= 3) r.top3 += 1
      if (s.place <= 5) r.top5 += 1
      if (s.place <= PLAYOFF_CUTOFF) r.playoffs += 1
      r.bestFinish = r.bestFinish === null ? s.place : Math.min(r.bestFinish, s.place)
      r.finishSum += s.place
      if (r.lastSeason === null || season.season > r.lastSeason) {
        r.lastSeason = season.season
        r.lastFinish = s.place
      }
      r.finishes.push({ season: season.season, place: s.place, record: s.record ?? null })
    }
    if (season.champion) {
      const r = row(season.champion)
      r.championships += 1
      r.finals += 1
    }
    if (season.runnerUp) {
      const r = row(season.runnerUp)
      r.runnerUps += 1
      r.finals += 1
    }
  }

  return [...rows.values()].map((r) => ({
    ...r,
    active: isActiveTeam(r.team),
    pct: r.w + r.l + r.t > 0 ? (r.w + r.t * 0.5) / (r.w + r.l + r.t) : 0,
    avgFinish: r.seasons > 0 ? r.finishSum / r.seasons : null,
    pointsFor: r.hasPoints ? r.pointsFor : null,
    finishes: r.finishes.sort((a, b) => b.season - a.season),
  }))
}

/** Default ordering: belts, then finals, then win pct. */
export function defaultSort(rows) {
  return [...rows].sort(
    (a, b) =>
      b.championships - a.championships ||
      b.finals - a.finals ||
      b.pct - a.pct ||
      (a.avgFinish ?? 99) - (b.avgFinish ?? 99),
  )
}

/**
 * League-wide superlatives for the Trophy Room records wall.
 *
 * `isEligible(team)` gates who can HOLD a record. The Trophy Room passes a
 * current-membership test, so a departed manager can't sit at the top of a
 * wall about the people still in the league. It defaults to allowing
 * everyone, so callers that want the full historical picture get it.
 */
export function computeRecords(rows, history, isEligible = () => true) {
  const eligible = rows.filter((r) => isEligible(r.team))
  if (!eligible.length) return []
  const by = (fn, dir = 'max') =>
    [...eligible].sort((a, b) => (dir === 'max' ? fn(b) - fn(a) : fn(a) - fn(b)))[0]

  const records = []
  const champs = by((r) => r.championships)
  if (champs?.championships > 0) records.push({ label: 'Most Championships', team: champs.team, value: `${champs.championships} 🏆` })

  const wins = by((r) => r.w)
  if (wins) records.push({ label: 'All-Time Wins', team: wins.team, value: `${wins.w} W` })

  const pct = by((r) => (r.seasons >= 3 ? r.pct : -1))
  if (pct) records.push({ label: 'Best Win %', team: pct.team, value: `${(pct.pct * 100).toFixed(1)}%` })

  const withPoints = eligible.filter((r) => r.pointsFor != null)
  if (withPoints.length) {
    const pts = withPoints.sort((a, b) => b.pointsFor - a.pointsFor)[0]
    records.push({ label: 'All-Time Points', team: pts.team, value: pts.pointsFor.toLocaleString('en-US', { maximumFractionDigits: 0 }) })
  }

  const avg = by((r) => (r.seasons >= 3 ? -(r.avgFinish ?? 99) : -99))
  if (avg?.avgFinish != null) records.push({ label: 'Best Avg Finish', team: avg.team, value: avg.avgFinish.toFixed(1) })

  const podiums = by((r) => r.top3)
  if (podiums?.top3 > 0) records.push({ label: 'Most Podiums', team: podiums.team, value: `${podiums.top3}× Top 3` })

  // Longest title streak from history
  const seasonsAsc = [...history].sort((a, b) => a.season - b.season)
  let bestStreak = { team: null, len: 0 }
  let cur = { team: null, len: 0, lastSeason: null }
  for (const s of seasonsAsc) {
    if (!s.champion || !isEligible(s.champion)) continue
    if (s.champion === cur.team && s.season === (cur.lastSeason ?? -99) + 1) {
      cur.len += 1
    } else {
      cur = { team: s.champion, len: 1 }
    }
    cur.lastSeason = s.season
    if (cur.len > bestStreak.len) bestStreak = { team: cur.team, len: cur.len }
  }
  if (bestStreak.len >= 2) records.push({ label: 'Longest Title Streak', team: bestStreak.team, value: `${bestStreak.len} straight` })

  return records
}

/** Owner's full name for display, falling back to the master team name. */
export const ownerName = (team) => teamByName[team]?.owner ?? team

/**
 * Per-season finish map with champion/runner-up fallback — a season whose
 * standings are missing (like the 2008 shell) still yields place 1 for its
 * champion and place 2 for its runner-up.
 */
function placeMaps(history) {
  const maps = new Map() // season → Map(team → place)
  for (const s of history) {
    const m = new Map()
    for (const row of s.standings ?? []) m.set(row.teamName, row.place)
    if (s.champion && !m.has(s.champion)) m.set(s.champion, 1)
    if (s.runnerUp && !m.has(s.runnerUp)) m.set(s.runnerUp, 2)
    maps.set(s.season, m)
  }
  return maps
}

/**
 * Season extremes for the Trophy Room:
 *   bestSeason / worstSeason — highest/lowest single-season win pct
 *   turnaround / collapse    — biggest year-over-year place jump/fall
 * Each entry carries team, season(s), and display detail.
 *
 * `isEligible(team)` gates who can hold one, same as computeRecords. Places
 * are still read from the full standings, so a filtered team's finish stays
 * accurate — it just can't be the one reported.
 */
export function computeSuperlatives(history, isEligible = () => true) {
  let best = null
  let worst = null
  for (const s of history) {
    for (const row of s.standings ?? []) {
      if (!isEligible(row.teamName)) continue
      const { w, l, t } = parseRecord(row.record)
      const games = w + l + t
      if (games === 0) continue
      const pct = (w + t * 0.5) / games
      const entry = { team: row.teamName, season: s.season, record: row.record, pct, place: row.place, champion: s.champion === row.teamName }
      if (!best || pct > best.pct) best = entry
      if (!worst || pct < worst.pct) worst = entry
    }
  }

  const maps = placeMaps(history)
  const seasons = [...maps.keys()].sort((a, b) => a - b)
  let turnaround = null // biggest improvement (prevPlace - curPlace max)
  let collapse = null // biggest fall (curPlace - prevPlace max)
  for (let i = 1; i < seasons.length; i++) {
    if (seasons[i] !== seasons[i - 1] + 1) continue // gap years can't compare
    const prev = maps.get(seasons[i - 1])
    const cur = maps.get(seasons[i])
    for (const [team, place] of cur) {
      if (!isEligible(team)) continue
      const prevPlace = prev.get(team)
      if (prevPlace == null) continue
      const delta = prevPlace - place
      const entry = { team, from: prevPlace, to: place, seasonFrom: seasons[i - 1], seasonTo: seasons[i] }
      if (delta > 0 && (!turnaround || delta > turnaround.from - turnaround.to)) turnaround = entry
      if (delta < 0 && (!collapse || -delta > collapse.to - collapse.from)) collapse = entry
    }
  }

  return { bestSeason: best, worstSeason: worst, turnaround, collapse }
}

/**
 * Championship & top-3 drought table for the current 12 franchises.
 * Droughts count from the latest completed season in history; a team that
 * never got there shows 'never' with its seasons-played count.
 */
export function computeDroughts(history) {
  const latest = Math.max(...history.map((s) => s.season))
  const maps = placeMaps(history)

  const rows = []
  for (const teamMeta of Object.values(teamByName)) {
    const team = teamMeta.name
    let lastTitle = null
    let lastTop3 = null
    let seasonsPlayed = 0
    for (const s of history) {
      const place = maps.get(s.season)?.get(team)
      if (place == null) continue
      seasonsPlayed += 1
      if (place === 1 && (lastTitle === null || s.season > lastTitle)) lastTitle = s.season
      if (place <= 3 && (lastTop3 === null || s.season > lastTop3)) lastTop3 = s.season
    }
    if (seasonsPlayed === 0) continue
    rows.push({
      team,
      owner: ownerName(team),
      seasonsPlayed,
      lastTitle,
      titleDrought: lastTitle === null ? null : latest - lastTitle,
      lastTop3,
      top3Drought: lastTop3 === null ? null : latest - lastTop3,
    })
  }

  // Titled teams by freshest belt first, never-titled after by tenure
  return rows.sort((a, b) => {
    if (a.lastTitle === null && b.lastTitle === null) return b.seasonsPlayed - a.seasonsPlayed
    if (a.lastTitle === null) return 1
    if (b.lastTitle === null) return -1
    return b.lastTitle - a.lastTitle
  })
}
