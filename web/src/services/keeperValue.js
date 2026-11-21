// keeperValue — did a keeper's escalated price pay off?
//
// The auction history already flags which picks were kept (`data/auctionHistory.js`,
// column 8) and the Trophy Room's Draft Return chart already answers "who drafts
// well overall" (services/draftAnalytics.js, from precomputed aggregates). Neither
// answers the question the league actually argues about every July: was keeping
// THIS player at his escalated price worth it. That needs the keeper rows joined
// against real season points, so this reads `historyPlayerSeasons` directly rather
// than a precomputed aggregate — there is no existing join that already has it.
//
// A kept pick with no matching player-season (dropped before the season had any
// stats attached to him) is excluded rather than counted as zero — zero would say
// "this keeper was worthless," when the honest answer is "we don't know."

const normalizeName = (name) => String(name ?? '').trim().toLowerCase()

/**
 * Season totals for every player, keyed by season+name, from the docs
 * fs.fetchHistoryPlayerSeasons() returns ({ season, rows: [{player, points}] }).
 * Summed across rows so a mid-season trade's two team-lines still join once.
 */
function pointsByPlayerSeason(playerSeasons) {
  const byKey = new Map()
  for (const doc of playerSeasons ?? []) {
    const season = Number(doc.season)
    for (const row of doc.rows ?? []) {
      const key = `${season}|${normalizeName(row.player)}`
      byKey.set(key, (byKey.get(key) ?? 0) + (Number(row.points) || 0))
    }
  }
  return byKey
}

/**
 * Every kept auction pick with a real points-per-dollar, bought picks excluded.
 *
 * @param auctionRows - auctionHistory rows: [season, team, player, position, nflTeam, price, overallPick, keeper]
 * @param playerSeasons - docs from fs.fetchHistoryPlayerSeasons()
 * @param includeTeam - (team) => bool, same shape as isActiveTeam
 * @returns [{ season, team, player, position, nflTeam, price, points, ptsPerDollar }]
 */
export function keeperPicks(auctionRows, playerSeasons, includeTeam = () => true) {
  const points = pointsByPlayerSeason(playerSeasons)
  const picks = []
  for (const row of auctionRows ?? []) {
    const [season, team, player, position, nflTeam, price, , keeper] = row
    if (!keeper || !includeTeam(team)) continue
    const spend = Number(price) || 0
    if (spend <= 0) continue
    const key = `${Number(season)}|${normalizeName(player)}`
    if (!points.has(key)) continue
    const pts = points.get(key)
    picks.push({ season: Number(season), team, player, position, nflTeam, price: spend, points: pts, ptsPerDollar: pts / spend })
  }
  return picks
}

/**
 * Per-team career leaderboard over keeper picks only, best return first.
 *
 * @returns [{ team, spend, points, picks, ptsPerDollar }]
 */
export function keeperLeaderboard(picks) {
  const byTeam = new Map()
  for (const p of picks ?? []) {
    const t = byTeam.get(p.team) ?? { team: p.team, spend: 0, points: 0, picks: 0 }
    t.spend += p.price
    t.points += p.points
    t.picks += 1
    byTeam.set(p.team, t)
  }
  return [...byTeam.values()]
    .map((t) => ({ ...t, ptsPerDollar: t.spend > 0 ? t.points / t.spend : 0 }))
    .sort((a, b) => b.ptsPerDollar - a.ptsPerDollar)
}

/** The single best points-per-dollar keeper pick in the list, or null if empty. */
export function bestKeeperPick(picks) {
  return (picks ?? []).reduce((best, p) => (!best || p.ptsPerDollar > best.ptsPerDollar ? p : best), null)
}

/** The single worst points-per-dollar keeper pick in the list, or null if empty. */
export function worstKeeperPick(picks) {
  return (picks ?? []).reduce((worst, p) => (!worst || p.ptsPerDollar < worst.ptsPerDollar ? p : worst), null)
}

/**
 * Everything the Keeper Verdicts section needs, composed from the three
 * functions above.
 *
 * @returns { leaderboard, bestPick, worstPick, picks }
 */
export function keeperValue(auctionRows, playerSeasons, includeTeam = () => true) {
  const picks = keeperPicks(auctionRows, playerSeasons, includeTeam)
  return {
    leaderboard: keeperLeaderboard(picks),
    bestPick: bestKeeperPick(picks),
    worstPick: worstKeeperPick(picks),
    picks,
  }
}
