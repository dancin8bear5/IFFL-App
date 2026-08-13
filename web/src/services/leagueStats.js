// leagueStats — all-time career stats computed from the leagueHistory
// collection (17 seeded seasons). Powers the League History sortable table
// and the Trophy Room.

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

export const PLAYOFF_CUTOFF = 6 // top 6 make the playoffs (12-team format)

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

/** League-wide superlatives for the Trophy Room records wall. */
export function computeRecords(rows, history) {
  if (!rows.length) return []
  const by = (fn, dir = 'max') =>
    [...rows].sort((a, b) => (dir === 'max' ? fn(b) - fn(a) : fn(a) - fn(b)))[0]

  const records = []
  const champs = by((r) => r.championships)
  if (champs?.championships > 0) records.push({ label: 'Most Championships', team: champs.team, value: `${champs.championships} 🏆` })

  const wins = by((r) => r.w)
  if (wins) records.push({ label: 'All-Time Wins', team: wins.team, value: `${wins.w} W` })

  const pct = by((r) => (r.seasons >= 3 ? r.pct : -1))
  if (pct) records.push({ label: 'Best Win %', team: pct.team, value: `${(pct.pct * 100).toFixed(1)}%` })

  const withPoints = rows.filter((r) => r.pointsFor != null)
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
    if (!s.champion) continue
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
