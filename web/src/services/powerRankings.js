// powerRankings — roster-strength ranking for all 12 teams.
//
// This is deliberately NOT an opinion poll or a record-based ranking (the
// POD's own rankings cover opinion; True Record covers performance). It
// ranks what a team actually CONTROLS right now, which is the only thing
// knowable in the off-season and the thing that matters for trade talk.
//
// The engine is auction salary. In a keeper auction league price is the
// league's own collective valuation of a player — it already encodes
// consensus talent, so summing it is a more honest strength signal than
// anything hand-weighted. Components:
//
//   rosterValue — total current-season salary of rostered players. The
//                 headline number and the sort key.
//   starValue   — salary tied up in the top 5. Separates a team with three
//                 studs from one with fifteen $20 guys at the same total.
//   depth       — rosterValue minus starValue.
//   capTotal    — luxury-tax exposure (see contracts.teamCapTotal), which
//                 differs from rosterValue because in-season waiver adds
//                 are cap-exempt.
//   picks       — draft capital held, counted separately: picks are real
//                 assets but they are not current strength, and folding
//                 them into rosterValue would rank a rebuilding team above
//                 a contender.
//
// Every number here is derived, never stored, so it can't drift out of
// sync with the rosters the way a hand-maintained column would.
import { ROSTER_CAP } from '../data/staticData.js'
import { teamCapTotal } from './contracts.js'

const STAR_COUNT = 5

/**
 * @param assets  every DisplayAsset in the league (players + picks)
 * @param teams   fantasyTeams (needs `.name`; `.owner` passed through)
 * @param season  active season, for cap math
 * @returns rows sorted strongest-first, each with rank + components
 */
export function computePowerRankings(assets, teams, season) {
  const rows = teams.map((team) => {
    const mine = assets.filter((a) => a.teamName === team.name)
    const players = mine
      .filter((a) => !a.isPick)
      .sort((a, b) => (b.currentPrice ?? 0) - (a.currentPrice ?? 0))
    const picks = mine.filter((a) => a.isPick)

    const rosterValue = players.reduce((s, a) => s + (a.currentPrice ?? 0), 0)
    const starValue = players.slice(0, STAR_COUNT).reduce((s, a) => s + (a.currentPrice ?? 0), 0)
    const capTotal = teamCapTotal(assets, team.name, season)

    return {
      teamName: team.name,
      owner: team.owner ?? null,
      rosterValue,
      starValue,
      depthValue: rosterValue - starValue,
      // Share of a team's money in its top 5 — high means top-heavy.
      starShare: rosterValue > 0 ? starValue / rosterValue : 0,
      playerCount: players.length,
      pickCount: picks.length,
      capTotal,
      overCap: capTotal > ROSTER_CAP,
      capRoom: ROSTER_CAP - capTotal,
      topPlayers: players.slice(0, 3).map((a) => ({ name: a.name, position: a.position, price: a.currentPrice ?? 0 })),
    }
  })

  const sorted = [...rows].sort((a, b) => b.rosterValue - a.rosterValue)
  // Competition ranking so tied roster values genuinely tie (see ownedRank).
  let lastValue = null
  let lastRank = 0
  return sorted.map((r, i) => {
    const rank = r.rosterValue === lastValue ? lastRank : i + 1
    lastValue = r.rosterValue
    lastRank = rank
    return { ...r, rank }
  })
}

/**
 * League-wide context for the cap tracker: how much of the field is over
 * the threshold, and the spread between richest and poorest roster.
 */
export function leagueCapSummary(rows) {
  if (rows.length === 0) return { overCount: 0, avgCap: 0, maxValue: 0, minValue: 0 }
  const values = rows.map((r) => r.rosterValue)
  return {
    overCount: rows.filter((r) => r.overCap).length,
    avgCap: Math.round(rows.reduce((s, r) => s + r.capTotal, 0) / rows.length),
    maxValue: Math.max(...values),
    minValue: Math.min(...values),
  }
}
