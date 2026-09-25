// legacyRankings — the all-time power ranking shown on the Dashboard while
// the league is between seasons.
//
// The in-season Power Rankings answer "who's loaded right now" (roster
// salary). Between seasons that question has no answer worth showing, so the
// board switches to the only ranking that never goes stale: what everyone
// has actually done, since 2009.
//
// SCORE = (career wins + championships × CHAMPIONSHIP_POINTS) ÷ seasons played
//
// One win is one point. A belt is worth CHAMPIONSHIP_POINTS of them, which
// is the whole argument, so the number is stated here rather than buried:
// at 20, a title is worth about two seasons' worth of wins.
//
// The whole thing is then divided by seasons played, so the board is a RATE
// — what a manager is worth per year in the league — not a career total.
// That's deliberate: totals reward showing up, and the league's tenures are
// uneven, so a founding member would outrank a better manager who joined
// late purely by having more Sundays behind him. Note the division covers
// BOTH terms; dividing only the championship term would shrink a belt to
// under two points for a long-tenured team and make titles irrelevant.
//
// There is no minimum-seasons floor: a short tenure with a strong rate
// leads the board, by design. Change either the constant or the divisor and
// the board re-sorts; the UI reads both directly, so the tooltip and the
// "how it's scored" line can never drift from the math.
import { computeAllTimeStats } from './leagueStats.js'
import { isActiveTeam } from '../data/staticData.js'

export const CHAMPIONSHIP_POINTS = 20

/**
 * Seasons each team actually played, keyed by team name.
 *
 * Counted here rather than taken from computeAllTimeStats().seasons because
 * that one only counts seasons with standings rows. A season seeded as a
 * shell — champion known, standings not filled in yet, which is exactly how
 * 2008 sits in Firestore — would hand out a championship without counting
 * the year it was won in, and as a divisor that quietly inflates the
 * champion's rate. Falling back to champion/runnerUp is the same treatment
 * leagueStats.placeMaps already gives shell seasons.
 */
function seasonsPlayed(history) {
  const counts = new Map()
  for (const season of history ?? []) {
    const present = new Set()
    for (const row of season.standings ?? []) {
      if (row?.teamName) present.add(row.teamName)
    }
    if (season.champion) present.add(season.champion)
    if (season.runnerUp) present.add(season.runnerUp)
    for (const team of present) counts.set(team, (counts.get(team) ?? 0) + 1)
  }
  return counts
}

/**
 * Career rows ranked by legacy score, best first.
 *
 * Each row carries the two components separately (`winPoints`, `beltPoints`)
 * because the chart stacks them — the split IS the story, and a lone total
 * would hide whether a team got there by grinding or by winning.
 *
 * Only current franchises are ranked; departed managers still appear in
 * League History, but a board of who's here is the useful comparison.
 */
export function computeLegacyRankings(history, championshipPoints = CHAMPIONSHIP_POINTS) {
  const played = seasonsPlayed(history)

  const rows = computeAllTimeStats(history ?? [])
    .filter((r) => isActiveTeam(r.team))
    .map((r) => {
      const seasons = played.get(r.team) ?? r.seasons ?? 0
      const careerPoints = r.w + r.championships * championshipPoints
      // A row can only exist if the team appeared somewhere in history, so
      // seasons is realistically >= 1 — but it is a divisor, so it gets a
      // guard rather than a comment promising it never happens.
      const per = (n) => (seasons > 0 ? n / seasons : 0)
      return {
        teamName: r.team,
        wins: r.w,
        losses: r.l,
        ties: r.t,
        seasons,
        championships: r.championships,
        runnerUps: r.runnerUps,
        pct: r.pct,
        // The two stacked components, already per-season so they still sum
        // to the score the bar is scaled against.
        winPoints: per(r.w),
        beltPoints: per(r.championships * championshipPoints),
        careerPoints, // undivided total, kept for the tooltip
        score: per(careerPoints),
      }
    })

  // Ties break toward the team with more belts, then the better win pct —
  // the same order of precedence the score itself expresses.
  rows.sort(
    (a, b) => b.score - a.score || b.championships - a.championships || b.pct - a.pct,
  )

  return rows.map((r, i) => ({ ...r, rank: i + 1 }))
}
