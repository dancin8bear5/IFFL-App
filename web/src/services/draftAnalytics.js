// draftAnalytics — Trophy Room math over the precomputed history aggregates
// (`historyAggregates/scoring` and `historyAggregates/draft`, written by
// web/scripts/import-history.mjs).
//
// These read from aggregates rather than raw docs on purpose: the scoring,
// spend and ROI charts each need a join across all 18 drafts and all 18
// player-season docs, which is ~1MB of Firestore reads to draw three charts.
// The import script does that join once and stores the finished numbers.

/** Positions that get their own band in the spend chart, in draft-board order. */
export const SPEND_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'D/ST', 'K']

/**
 * Per-team scoring history against the league average of the same season —
 * the only fair way to compare a 2018 offense (league avg 142 PPG) with a
 * 2025 one (123 PPG).
 *
 * @param scoring - historyAggregates/scoring doc: { seasons: [{season, leagueAvgPPG, teams}] }
 * @returns {
 *   seasons: [{season, leagueAvgPPG}],
 *   teams: [{ team, points: [{season, ppg, vsAvg}], best, worst }] (best vsAvg first),
 *   bestEver / worstEver: {team, season, ppg, vsAvg}
 * }
 */
export function scoringEras(scoring, includeTeam = () => true) {
  const seasons = (scoring?.seasons ?? [])
    .map((s) => ({ season: Number(s.season), leagueAvgPPG: Number(s.leagueAvgPPG) }))
    .sort((a, b) => a.season - b.season)

  const byTeam = new Map()
  for (const s of scoring?.seasons ?? []) {
    for (const t of s.teams ?? []) {
      if (!t?.team || t.ppg == null || !includeTeam(t.team)) continue
      if (!byTeam.has(t.team)) byTeam.set(t.team, [])
      byTeam.get(t.team).push({
        season: Number(s.season),
        ppg: Number(t.ppg),
        vsAvg: Math.round((Number(t.ppg) - Number(s.leagueAvgPPG)) * 100) / 100,
      })
    }
  }

  const teams = [...byTeam.entries()].map(([team, points]) => {
    const sorted = [...points].sort((a, b) => a.season - b.season)
    const byVs = [...points].sort((a, b) => b.vsAvg - a.vsAvg)
    return { team, points: sorted, best: byVs[0], worst: byVs[byVs.length - 1] }
  })

  const all = teams.flatMap((t) => t.points.map((p) => ({ ...p, team: t.team })))
  const ranked = [...all].sort((a, b) => b.vsAvg - a.vsAvg)

  return {
    seasons,
    teams: teams.sort((a, b) => b.best.vsAvg - a.best.vsAvg || a.team.localeCompare(b.team)),
    bestEver: ranked[0] ?? null,
    worstEver: ranked[ranked.length - 1] ?? null,
  }
}

/**
 * Auction spend share by position, season over season.
 * Positions outside SPEND_POSITIONS are folded into an 'Other' band so the
 * bands always total 100%.
 *
 * @param draft - historyAggregates/draft doc: { positionSpend: [{season, total, byPosition}] }
 * @returns [{ season, total, shares: { QB: 0.24, … , Other: 0.01 } }] season-ascending
 */
export function positionSpendShare(draft) {
  return (draft?.positionSpend ?? [])
    .map((s) => {
      const total = Number(s.total) || 0
      const shares = {}
      let known = 0
      for (const pos of SPEND_POSITIONS) {
        const v = Number(s.byPosition?.[pos] ?? 0)
        shares[pos] = total > 0 ? v / total : 0
        known += v
      }
      shares.Other = total > 0 ? Math.max(0, (total - known) / total) : 0
      return { season: Number(s.season), total, shares }
    })
    .sort((a, b) => a.season - b.season)
}

/**
 * Draft return on investment: fantasy points produced per auction dollar,
 * counting each pick's points on the roster that drafted him. A pick who
 * scored nothing for you counts as zero, which is the honest treatment —
 * that dollar bought nothing.
 *
 * @param draft - historyAggregates/draft doc: { roi: [{season, team, spend, points, ptsPerDollar}] }
 * @returns {
 *   career: [{ team, spend, points, ptsPerDollar, seasons }] (best first),
 *   bestClass / worstClass: {team, season, ptsPerDollar} across teams with a full draft
 * }
 */
export function draftROI(draft, includeTeam = () => true) {
  const rows = (draft?.roi ?? []).filter((r) => r?.team && includeTeam(r.team) && Number(r.spend) > 0)

  const byTeam = new Map()
  for (const r of rows) {
    const t = byTeam.get(r.team) ?? { team: r.team, spend: 0, points: 0, seasons: 0 }
    t.spend += Number(r.spend)
    t.points += Number(r.points)
    t.seasons += 1
    byTeam.set(r.team, t)
  }

  const career = [...byTeam.values()]
    .map((t) => ({ ...t, ptsPerDollar: t.spend > 0 ? t.points / t.spend : 0 }))
    .sort((a, b) => b.ptsPerDollar - a.ptsPerDollar)

  // A "class" is one team's draft in one season. Teams that barely drafted
  // (a handful of picks after keepers) would otherwise dominate both ends.
  const classes = rows
    .filter((r) => Number(r.picks ?? 0) >= 5)
    .map((r) => ({ team: r.team, season: Number(r.season), ptsPerDollar: Number(r.ptsPerDollar), spend: Number(r.spend), points: Number(r.points) }))
    .sort((a, b) => b.ptsPerDollar - a.ptsPerDollar)

  return {
    career,
    bestClass: classes[0] ?? null,
    worstClass: classes[classes.length - 1] ?? null,
  }
}
