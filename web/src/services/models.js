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

export function pickToDisplayAsset(pick, activeSeason) {
  const name = pickDisplayName(pick)
  return {
    id: pick.id,
    teamName: pick.currentTeamName,
    position: 'Draft Pick',
    name,
    currentPrice: pick.prices?.[String(activeSeason)] ?? 0,
    prices: pick.prices ?? {},
    originalPrice: pick.prices?.[String(pick.season)] ?? 0,
    purchaseYear: pick.season,
    contractYearsRemaining: 1,
    playerPool: 'Rookie Draft',
    rookieRound: pick.round,
    rookieDraftYear: pick.season,
    tradeHistory: pick.tradeHistory ?? [],
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
