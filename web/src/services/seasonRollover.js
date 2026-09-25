// seasonRollover — the guided, previewable routine for the day after the
// season ends. Pure functions, zero Firebase deps (same pattern as
// contracts.js / keeperImport.js) so the plan computation unit-tests clean
// and can be previewed with no risk before anything is ever written.
//
// Scope, deliberately narrow to what's mechanically well-defined from data
// this app owns:
//   1. Extend every rostered player's price map one more year forward
//      (keeps the rolling 3-year window contracts.js/KeeperBuilder expect)
//   2. Generate next year's 24 rookie picks (2 per team: R1 $2, R2 $1),
//      unslotted — matches the existing convention for not-yet-drafted
//      picks (e.g. "2027 1st"); lottery/slot assignment is a separate,
//      later step this does not attempt.
//   3. Advance activeSeasonYear.
// Explicitly OUT of scope: archiving final standings to leagueHistory.
// ESPN owns final standings and this app has no automated way to pull
// them — fabricating a season record would be actively wrong. The plan
// just flags it as a reminder if that season isn't seeded yet.
// Players with salaryStatus 'dropped_pending' or 'cleared' are skipped —
// those are keeper elections/waiver resolutions, not a rollover's job;
// resolve them via Drops / Keeper Import first.
import { nextPrice, contractYear } from './contracts.js'
import { fantasyTeams, ROOKIE_SALARY } from '../data/staticData.js'

/**
 * Extend a player's price map so it covers through toSeason+2 (the same
 * 3-year rolling window every price map is seeded with). Idempotent —
 * returns the same map untouched (by value) if it already reaches far
 * enough forward.
 */
export function extendPriceMap(player, toSeason) {
  const prices = { ...(player.prices ?? {}) }
  const target = toSeason + 2
  const known = Object.keys(prices).map(Number).filter(Number.isFinite)
  let farthest = known.length ? Math.max(...known) : toSeason - 1
  let price = prices[String(farthest)] ?? player.originalPrice ?? 0
  while (farthest < target) {
    const cy = contractYear(player.purchaseYear, farthest)
    price = nextPrice(price, cy)
    farthest += 1
    prices[String(farthest)] = price
  }
  return prices
}

/** Flat round-level pick price map: R1 $2→…, R2 $1→…, 3-year window. */
function pickPriceMap(round, season) {
  let price = ROOKIE_SALARY[round]
  const prices = { [season]: price }
  for (let s = season + 1; s <= season + 2; s++) {
    price = nextPrice(price, contractYear(season, s - 1))
    prices[s] = price
  }
  return prices
}

/**
 * Compute the full rollover plan from `fromSeason` to `toSeason`
 * (normally toSeason = fromSeason + 1). Nothing here touches Firestore —
 * this is the dry-run preview shown in Admin before anything is armed.
 *
 * `players` — active roster docs (id, name, teamName, position, prices,
 * purchaseYear, originalPrice, contractYearsRemaining, isActive,
 * salaryStatus, isPick-excluded already or not — picks are filtered out).
 * `leagueHistorySeasons` — Set/array of season numbers already archived,
 * used only to flag the reminder below.
 *
 * Returns {
 *   fromSeason, toSeason,
 *   priceUpdates: [{id, name, teamName, prices, contractYearsRemaining}],
 *   skipped: [{id, name, teamName, reason}],
 *   newPicks: [{season, round, currentTeamName, prices, tradeHistory, status}],
 *   historyReminder: bool,
 * }
 */
export function computeRolloverPlan(players, toSeason, leagueHistorySeasons = [], teams = fantasyTeams) {
  const fromSeason = toSeason - 1
  const priceUpdates = []
  const skipped = []

  for (const p of players) {
    if (p.isPick) continue
    if (p.isActive === false) { skipped.push({ id: p.id, name: p.name, teamName: p.teamName, reason: 'inactive' }); continue }
    const status = p.salaryStatus ?? 'rostered'
    if (status !== 'rostered') {
      skipped.push({ id: p.id, name: p.name, teamName: p.teamName, reason: status === 'dropped_pending' ? 'drop pending — resolve first' : 'cleared — resolve keeper election first' })
      continue
    }
    const prices = extendPriceMap(p, toSeason)
    const cy = contractYear(p.purchaseYear, toSeason)
    const pricesChanged = JSON.stringify(prices) !== JSON.stringify(p.prices ?? {})
    const cyChanged = cy !== p.contractYearsRemaining
    if (pricesChanged || cyChanged) {
      priceUpdates.push({ id: p.id, name: p.name, teamName: p.teamName, prices, contractYearsRemaining: cy })
    }
  }

  const pickSeason = toSeason + 1
  const newPicks = []
  for (const team of teams) {
    for (const round of [1, 2]) {
      newPicks.push({
        season: pickSeason,
        round,
        currentTeamName: team.name,
        originalTeamName: team.name,
        prices: pickPriceMap(round, pickSeason),
        tradeHistory: [],
        status: 'available',
      })
    }
  }

  const historyReminder = !leagueHistorySeasons.includes(fromSeason)

  return { fromSeason, toSeason, priceUpdates, skipped, newPicks, historyReminder }
}
