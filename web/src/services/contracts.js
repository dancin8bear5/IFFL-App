// contracts — the salary engine. Pure functions, zero Firebase deps
// (mirrors the MarketEngine pattern so it unit-tests clean).
//
// The league's one money formula, verified 231/231 against the 2025 Keeper
// Master CSV and the handbook's worked examples:
//
//   next year's price = this year's price + ($5 × contract year)
//
// where contract year = season − purchaseYear + 1 (a 2024 purchase is on
// contract year 2 in 2025). It applies identically to auction buys, rookie
// picks and kept waiver players — a waiver keeper just enters at a flat $2
// base regardless of the FAAB bid, then escalates like everyone else
// ($2 → $7 → $17 → $32).
import {
  KEEPER_ESCALATION_STEP,
  WAIVER_KEEPER_VALUE,
  PRACTICAL_MAX_CONTRACT_YEAR,
} from '../data/staticData.js'

/** Contract year in `season` for a player purchased in `purchaseYear`. */
export const contractYear = (purchaseYear, season) => season - purchaseYear + 1

/** Price for the season after one priced at `price` in contract year `yearsKept`. */
export const nextPrice = (price, yearsKept) =>
  price + KEEPER_ESCALATION_STEP * yearsKept

/** Flat re-entry value once a dropped player clears two FAAB auctions. */
export const waiverResetValue = () => WAIVER_KEEPER_VALUE

/**
 * Price in an arbitrary future season, chained from a known point.
 * `knownSeason` must be ≥ purchaseYear; returns null for seasons before it.
 */
export function priceInSeason(knownPrice, knownSeason, purchaseYear, season) {
  if (season < knownSeason) return null
  let price = knownPrice
  for (let y = knownSeason; y < season; y++) {
    price = nextPrice(price, contractYear(purchaseYear, y))
  }
  return price
}

/**
 * Project a player's prices forward — {season: price} starting at
 * `fromSeason`, running through contract year PRACTICAL_MAX_CONTRACT_YEAR
 * (no hard cap exists; Y6 matches the deepest contracts in the data).
 * This is what keeps KeeperBuilder from dying past the stored 3-year map.
 */
export function projectPrices(player, fromSeason, maxYears = PRACTICAL_MAX_CONTRACT_YEAR) {
  const base = player.prices?.[String(fromSeason)]
  const startPrice = base ?? player.originalPrice ?? 0
  const out = {}
  let price = startPrice
  for (let season = fromSeason; ; season++) {
    const cy = contractYear(player.purchaseYear, season)
    if (cy > maxYears) break
    out[season] = price
    price = nextPrice(price, cy)
  }
  // A player already past Y-max still shows his current season
  if (Object.keys(out).length === 0) out[fromSeason] = startPrice
  return out
}

/**
 * Does this player count toward the $300 luxury-tax threshold in `season`?
 * Only drafted/kept salary counts. A waiver pickup made during `season`
 * itself is exempt — he only enters the cap system if kept the next year
 * (at $2). Everyone else on a roster is drafted or kept, and counts.
 */
export function countsTowardCap(player, season) {
  if (player.playerPool === 'Free Agent' && (player.purchaseYear ?? 0) >= season) return false
  return true
}

/**
 * A team's luxury-tax exposure: the sum of drafted/kept salary among its
 * ROSTERED players in `season`. Picks and in-season waiver pickups are
 * exempt. Works on DisplayAssets (currentPrice) or raw player docs
 * (prices map).
 */
export function teamCapTotal(assets, teamName, season) {
  return assets
    .filter(
      (a) =>
        a.teamName === teamName &&
        !a.isPick &&
        (a.salaryStatus ?? 'rostered') === 'rostered' &&
        countsTowardCap(a, season),
    )
    .reduce((sum, a) => sum + (a.currentPrice ?? a.prices?.[String(season)] ?? 0), 0)
}

/**
 * What both sides' cap totals become if a trade executes.
 * `sending`/`receiving` are arrays of DisplayAssets leaving each team.
 * Returns {proposer: {before, after}, receiver: {before, after}}.
 */
export function tradeCapImpact(assets, season, proposerTeam, receiverTeam, fromProposer, fromReceiver) {
  const price = (a) => (a.isPick || !countsTowardCap(a, season) ? 0 : a.currentPrice ?? 0)
  const out = (list) => list.reduce((s, a) => s + price(a), 0)
  const proposerBefore = teamCapTotal(assets, proposerTeam, season)
  const receiverBefore = teamCapTotal(assets, receiverTeam, season)
  return {
    proposer: { before: proposerBefore, after: proposerBefore - out(fromProposer) + out(fromReceiver) },
    receiver: { before: receiverBefore, after: receiverBefore - out(fromReceiver) + out(fromProposer) },
  }
}

/**
 * Validate a player's stored price map against the formula.
 * Checks every consecutive season pair present in `prices`, plus the chain
 * from originalPrice at purchaseYear when that season is present.
 * Returns [] when clean, else one entry per bad season:
 *   {season, stored, expected}
 */
export function validatePrices(player) {
  const problems = []
  const seasons = Object.keys(player.prices ?? {})
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  if (seasons.length === 0) return problems

  // originalPrice anchors the chain when the purchase season is stored
  if (
    player.originalPrice != null &&
    player.purchaseYear != null &&
    seasons.includes(player.purchaseYear) &&
    player.prices[String(player.purchaseYear)] !== player.originalPrice
  ) {
    problems.push({
      season: player.purchaseYear,
      stored: player.prices[String(player.purchaseYear)],
      expected: player.originalPrice,
    })
  }

  for (let i = 0; i < seasons.length - 1; i++) {
    const y = seasons[i]
    if (seasons[i + 1] !== y + 1) continue // gap — can't check the pair
    const expected = nextPrice(player.prices[String(y)], contractYear(player.purchaseYear, y))
    const stored = player.prices[String(y + 1)]
    if (stored !== expected) problems.push({ season: y + 1, stored, expected })
  }
  return problems
}

/**
 * Repair payload for a drifted player: rebuild the full price map from the
 * earliest stored season (trusted as ground truth) forward through every
 * season the map already covers.
 */
export function repairedPrices(player) {
  const seasons = Object.keys(player.prices ?? {})
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  if (seasons.length === 0) return {}
  const first = seasons[0]
  const last = seasons[seasons.length - 1]
  const out = {}
  let price = player.prices[String(first)]
  for (let y = first; y <= last; y++) {
    out[String(y)] = price
    price = nextPrice(price, contractYear(player.purchaseYear, y))
  }
  return out
}
