// models — DisplayAsset conversion, port of Player.toDisplayAsset /
// DraftPickAsset.toDisplayAsset in Models/DataModels.swift.

export function playerToDisplayAsset(p, activeSeason) {
  return {
    id: p.id,
    teamName: p.teamName,
    position: p.position,
    name: p.name,
    currentPrice: p.prices?.[String(activeSeason)] ?? 0,
    prices: p.prices ?? {},
    originalPrice: p.originalPrice ?? 0,
    purchaseYear: p.purchaseYear ?? 0,
    contractYearsRemaining: p.contractYearsRemaining ?? 0,
    playerPool: p.playerPool ?? '',
    rookieRound: p.rookieRound ?? null,
    rookieDraftYear: p.rookieDraftYear ?? null,
    tradeHistory: p.tradeHistory ?? [],
    assetType: 'player',
    nflTeam: p.nflTeam ?? null,
    isPick: false,
    // Stable identity = the Firestore doc id. The old `${team}-${name}` key
    // changed whenever a player was traded, silently orphaning his FMK
    // signals and interest stars.
    assetId: p.id,
  }
}

export function pickDisplayName(pick) {
  return pick.slot != null
    ? `${pick.season} Round ${pick.round} (Pick ${pick.slot})`
    : `${pick.season} Round ${pick.round}`
}

/**
 * A pick is worth nothing until its own draft happens.
 *
 * A 2027 pick sitting on a roster in 2026 costs $0 against that season —
 * it can't count toward the cap and can't be kept, because there is
 * nothing there to keep yet. The stored map usually carries a figure for
 * the current season anyway (rollover writes the notional value forward),
 * so the correction is applied here rather than at each call site: every
 * consumer reads either `currentPrice` or `prices[season]`, and both come
 * from this one place.
 */
export function pickPricesFromOwnSeason(pick) {
  const season = Number(pick?.season)
  const out = {}
  for (const [yr, price] of Object.entries(pick?.prices ?? {})) {
    out[yr] = Number.isFinite(season) && Number(yr) < season ? 0 : price
  }
  return out
}

export function pickToDisplayAsset(pick, activeSeason) {
  const name = pickDisplayName(pick)
  const prices = pickPricesFromOwnSeason(pick)
  return {
    id: pick.id,
    teamName: pick.currentTeamName,
    position: 'Draft Pick',
    name,
    currentPrice: prices[String(activeSeason)] ?? 0,
    prices,
    originalPrice: pick.prices?.[String(pick.season)] ?? 0,
    purchaseYear: pick.season,
    contractYearsRemaining: 1,
    playerPool: 'Rookie Draft',
    rookieRound: pick.round,
    rookieDraftYear: pick.season,
    tradeHistory: pick.tradeHistory ?? [],
    // Who the pick was ORIGINALLY issued to. Shown in place of the word
    // "Original", which told you nothing you couldn't already see — on
    // someone else's roster, or in All Assets, the name is the useful part.
    originalTeamName: pick.originalTeamName ?? null,
    assetType: 'draftPick',
    nflTeam: null,
    isPick: true,
    assetId: pick.id, // stable doc id — survives trades (see playerToDisplayAsset)
  }
}

export function formatTradeDate(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`
}
