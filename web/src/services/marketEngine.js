// marketEngine — direct port of Services/MarketEngine.swift.
// Pure logic, no Firebase. Finds mutual FMK trade interest between team pairs.
//
// Signals: 'marry' (2 pts) > 'fuck' (1 pt) > 'kill' (0 pts, +1 bonus when the
// OWNER kills their own asset — they want to dump what the other team wants).
// Assets must be within valueDiffThreshold (10%) of each other's price.

const WANT_SCORE = { marry: 2, fuck: 1, kill: 0 }

/**
 * @param {Array}  fmkSignals - PlayerFMK docs: {teamName, assetId, signal}
 * @param {Array}  assets     - DisplayAssets: {id, assetId, teamName, currentPrice}
 * @param {?string} priorityTeam - matches involving this team sort first
 * @param {number} valueDiffThreshold - max relative price gap (default 0.10)
 * @returns {Array} TradeMatch: {id, teamA, teamB, aWants, bWants, matchScore}
 *   where aWants/bWants are MatchCandidate: {asset, signal, ownerSignal}
 */
export function findMatches(fmkSignals, assets, priorityTeam = null, valueDiffThreshold = 0.10) {
  const assetOwner = {}
  const assetById = {}
  for (const a of assets) {
    assetOwner[a.assetId] = a.teamName
    assetById[a.assetId] = a
  }

  // teamSignals[teamName][assetId] = signal
  const teamSignals = {}
  for (const fmk of fmkSignals) {
    ;(teamSignals[fmk.teamName] ??= {})[fmk.assetId] = fmk.signal
  }

  const results = []
  const teams = Object.keys(teamSignals)

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const teamA = teams[i]
      const teamB = teams[j]
      const aSignals = teamSignals[teamA] ?? {}
      const bSignals = teamSignals[teamB] ?? {}

      const aWantsIds = Object.entries(aSignals).filter(
        ([id, sig]) => (sig === 'fuck' || sig === 'marry') && assetOwner[id] === teamB,
      )
      const bWantsIds = Object.entries(bSignals).filter(
        ([id, sig]) => (sig === 'fuck' || sig === 'marry') && assetOwner[id] === teamA,
      )

      if (!aWantsIds.length || !bWantsIds.length) continue

      const bestAWants = []
      const bestBWants = []
      let matchScore = 0

      for (const [aId, aSig] of aWantsIds) {
        for (const [bId, bSig] of bWantsIds) {
          const aAsset = assetById[aId]
          const bAsset = assetById[bId]
          if (!aAsset || !bAsset) continue

          const aPrice = Math.max(aAsset.currentPrice, 1)
          const bPrice = Math.max(bAsset.currentPrice, 1)
          const valueDiff = Math.abs(aPrice - bPrice) / Math.max(aPrice, bPrice)
          if (valueDiff > valueDiffThreshold) continue

          const ownerASignal = bSignals[aId] ?? null // B's signal for their own asset
          const ownerBSignal = aSignals[bId] ?? null // A's signal for their own asset

          let pairScore = WANT_SCORE[aSig] + WANT_SCORE[bSig]
          if (ownerASignal === 'kill') pairScore += 1
          if (ownerBSignal === 'kill') pairScore += 1

          if (pairScore > 0) {
            if (!bestAWants.some((c) => c.asset.id === aAsset.id)) {
              bestAWants.push({ asset: aAsset, signal: aSig, ownerSignal: ownerASignal })
            }
            if (!bestBWants.some((c) => c.asset.id === bAsset.id)) {
              bestBWants.push({ asset: bAsset, signal: bSig, ownerSignal: ownerBSignal })
            }
            matchScore = Math.max(matchScore, pairScore)
          }
        }
      }

      if (!bestAWants.length || !bestBWants.length) continue

      results.push({
        id: `${teamA}↔${teamB}`,
        teamA,
        teamB,
        aWants: bestAWants,
        bWants: bestBWants,
        matchScore,
      })
    }
  }

  results.sort((a, b) => b.matchScore - a.matchScore)

  if (priorityTeam) {
    const priority = results.filter((m) => m.teamA === priorityTeam || m.teamB === priorityTeam)
    const others = results.filter((m) => m.teamA !== priorityTeam && m.teamB !== priorityTeam)
    return [...priority, ...others]
  }

  return results
}
