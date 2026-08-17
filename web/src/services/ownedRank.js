// ownedRank — where an asset sits in the league's salary hierarchy.
//
// "Owned rank" answers the question you actually ask mid-trade: is this guy
// a top-10 asset in the league, or the 40th-most-expensive body on a roster?
// Two flavors, both computed off the CURRENT season's price:
//
//   ownedRank — across every owned player in the league (RB2 overall etc.)
//   posRank   — within that player's own position (the useful one for
//               "is this a startable RB or depth?")
//
// Excludes draft picks only — a 2027 1st isn't a player and its price
// means something different. Everything else in allDisplayAssets is
// already filtered to rostered players, so it IS owned by definition.
//
// Note `playerPool: 'Free Agent'` does NOT mean unowned: it records HOW a
// player was acquired (off waivers rather than drafted/kept), which is what
// makes him luxury-tax exempt for that season. Such a player is still on
// somebody's roster and absolutely belongs in the rankings — an early
// version of this file excluded him and left waiver pickups showing "—".
//
// Ties share a rank and then skip — standard competition ranking, so two
// players tied at 3rd are both "3" and the next is "5". A tie in an
// auction league is common and meaningful; an arbitrary tiebreak by name
// would invent precision that isn't there.

const isOwnedPlayer = (a) => !a.isPick

/** Assigns competition ranks over `list`, ordered by current price desc. */
function assignRanks(list, key) {
  const sorted = [...list].sort((a, b) => (b.currentPrice ?? 0) - (a.currentPrice ?? 0))
  const ranks = new Map()
  let lastPrice = null
  let lastRank = 0
  sorted.forEach((a, i) => {
    const price = a.currentPrice ?? 0
    const rank = price === lastPrice ? lastRank : i + 1
    ranks.set(a.assetId, rank)
    lastPrice = price
    lastRank = rank
  })
  return { ranks, total: sorted.length, key }
}

/**
 * Returns a NEW array with `ownedRank`, `ownedRankTotal`, `posRank`, and
 * `posRankTotal` attached to every owned player. Picks and free agents come
 * back untouched (all four fields null) so callers can render "—" without
 * special-casing.
 */
export function withOwnedRanks(assets) {
  const owned = assets.filter(isOwnedPlayer)
  const overall = assignRanks(owned)

  const byPos = new Map()
  for (const a of owned) {
    if (!byPos.has(a.position)) byPos.set(a.position, [])
    byPos.get(a.position).push(a)
  }
  const posRanks = new Map()
  const posTotals = new Map()
  for (const [pos, list] of byPos) {
    const { ranks, total } = assignRanks(list)
    posTotals.set(pos, total)
    for (const [id, rank] of ranks) posRanks.set(id, rank)
  }

  return assets.map((a) =>
    isOwnedPlayer(a)
      ? {
          ...a,
          ownedRank: overall.ranks.get(a.assetId) ?? null,
          ownedRankTotal: overall.total,
          posRank: posRanks.get(a.assetId) ?? null,
          posRankTotal: posTotals.get(a.position) ?? null,
        }
      : { ...a, ownedRank: null, ownedRankTotal: null, posRank: null, posRankTotal: null },
  )
}

/** "RB4" / "QB12" — compact positional label for a row or badge. */
export function posRankLabel(asset) {
  if (asset?.posRank == null) return null
  return `${asset.position}${asset.posRank}`
}
