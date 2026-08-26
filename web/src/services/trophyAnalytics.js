// trophyAnalytics — distribution stats for the Trophy Room.
//
// The rest of the Trophy Room reports single numbers: most titles, best win
// pct, all-time points. Those say where a manager peaked but nothing about
// what he is year to year. A 4th-place average hides whether that's a steady
// 4th every season or a 1st-and-12th coin flip, and in a 17-year league the
// difference is the whole personality of a franchise.
//
// So everything here is a RANGE: best to worst, with the median marked.
//
// A note on what is NOT here. There is no historical auction-spend series,
// because the app never stored one — `leagueHistory` carries standings only,
// and player price maps cover the current roster forward. Money stats below
// are therefore CURRENT-ROSTER stats and are labelled as such in the UI.
// Season-by-season auction history would need a seeding pass first.
import { isActiveTeam } from '../data/staticData.js'

/** Median of a numeric array. Returns null for an empty one. */
export function median(values) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Every finish a team has recorded, best-first, plus the shape of that
 * spread. `volatility` is worst − best: the honest measure of whether a
 * franchise is steady or a rollercoaster.
 *
 * Sorted by median finish, then by best — the ordering a reader expects
 * from "who is consistently good".
 */
export function finishRanges(history, activeOnly = true) {
  const byTeam = new Map()
  for (const season of history ?? []) {
    for (const row of season.standings ?? []) {
      if (!row?.teamName || row.place == null) continue
      if (!byTeam.has(row.teamName)) byTeam.set(row.teamName, [])
      byTeam.get(row.teamName).push({ season: season.season, place: row.place })
    }
  }

  const rows = []
  for (const [team, finishes] of byTeam) {
    if (activeOnly && !isActiveTeam(team)) continue
    const places = finishes.map((f) => f.place)
    rows.push({
      team,
      seasons: places.length,
      best: Math.min(...places),
      worst: Math.max(...places),
      med: median(places),
      volatility: Math.max(...places) - Math.min(...places),
      finishes: [...finishes].sort((a, b) => a.season - b.season),
    })
  }

  return rows.sort((a, b) => a.med - b.med || a.best - b.best || a.team.localeCompare(b.team))
}

/**
 * Team × season grid of finishing places for the heatmap.
 *
 * `seasons` is every season present, ascending, so columns line up even
 * where a team wasn't in the league — those cells come back undefined and
 * render as a gap rather than as a bad finish, which is the whole reason
 * this returns a sparse map instead of a padded array.
 */
export function finishGrid(history, activeOnly = true) {
  const seasons = [...new Set((history ?? []).map((s) => s.season))]
    .filter(Number.isFinite)
    .sort((a, b) => a - b)

  const rows = finishRanges(history, activeOnly).map((r) => ({
    team: r.team,
    med: r.med,
    best: r.best,
    worst: r.worst,
    seasons: r.seasons,
    places: new Map(r.finishes.map((f) => [f.season, f.place])),
  }))

  const allPlaces = rows.flatMap((r) => [...r.places.values()])
  return {
    seasons,
    rows,
    maxPlace: allPlaces.length ? Math.max(...allPlaces) : 0,
  }
}

/**
 * Current-roster salary spread per team: cheapest man, median, priciest,
 * and the total. NOT auction spend — see the file header.
 *
 * Draft picks are excluded. A pick carries a nominal price that isn't a
 * salary paid for a player, and leaving them in drags every median toward
 * the pick price.
 */
export function salaryRanges(assets, teams) {
  const byTeam = new Map(teams.map((t) => [t.name, []]))
  for (const a of assets ?? []) {
    if (a.isPick) continue
    if (!byTeam.has(a.teamName)) continue
    byTeam.get(a.teamName).push(a.currentPrice ?? 0)
  }

  return [...byTeam.entries()]
    .map(([team, prices]) => ({
      team,
      count: prices.length,
      total: prices.reduce((s, p) => s + p, 0),
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
      med: prices.length ? median(prices) : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

/**
 * Keepable talent per team — players at or under the keeper price line.
 * Anyone pricier won't be kept, so counting him would overstate the war
 * chest. Mirrors the Dashboard's keeper math.
 */
export function keeperRanges(assets, teams, keeperMax) {
  const byTeam = new Map(teams.map((t) => [t.name, []]))
  for (const a of assets ?? []) {
    if (a.isPick || (a.currentPrice ?? 0) > keeperMax) continue
    if (!byTeam.has(a.teamName)) continue
    byTeam.get(a.teamName).push(a.currentPrice ?? 0)
  }

  return [...byTeam.entries()]
    .map(([team, prices]) => ({
      team,
      count: prices.length,
      total: prices.reduce((s, p) => s + p, 0),
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
      med: prices.length ? median(prices) : 0,
    }))
    .sort((a, b) => b.total - a.total)
}
