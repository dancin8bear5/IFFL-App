// tradeEdit — repairing a trade that was recorded with something missing.
//
// This exists because ESPN emails cannot carry draft picks. A trade that
// auto-applies from an ESPN email moves the players correctly and knows
// nothing about a pick that was part of the same deal, so the pick sits
// with its original owner and the ledger tells a slightly false story.
//
// The fix is to add the missing asset to the trade that already exists,
// rather than recording a second trade — two half-trades between the same
// teams on the same day is worse than one incomplete one, because nothing
// afterwards can tell they were the same deal.
//
// Pure planning lives here so the direction logic is testable. The Firestore
// writes are in firestoreService.addAssetToTrade / removeAssetFromTrade.

/** Which array holds what each side SENDS. Mirrors the trade doc's shape. */
export const PROPOSER_SIDE = 'assetsFromProposer'
export const RECEIVER_SIDE = 'assetsFromReceiver'

const sidesOf = (trade) => [trade?.proposingTeamName, trade?.receivingTeamName].filter(Boolean)

/** Every asset already recorded on the trade, with the side it sits on. */
export function listedAssets(trade) {
  return [
    ...(trade?.[PROPOSER_SIDE] ?? []).map((a) => ({ ...a, side: PROPOSER_SIDE })),
    ...(trade?.[RECEIVER_SIDE] ?? []).map((a) => ({ ...a, side: RECEIVER_SIDE })),
  ]
}

/**
 * Work out how a missed asset should be attached.
 *
 * `asset.currentTeam` is who holds it right now — which, for the case this
 * is built for, is the team that was supposed to send it and never did. The
 * trade has exactly two sides, so the destination is the other one and the
 * caller never has to specify a direction that could be got backwards.
 *
 * Returns {ok:false, error} rather than throwing: every rejection here is
 * something a human needs to read and act on, not an exception.
 */
export function planAssetAddition(trade, asset) {
  if (!trade) return { ok: false, error: 'No trade selected.' }
  const teams = sidesOf(trade)
  if (teams.length !== 2) {
    return { ok: false, error: 'This trade does not have two teams recorded.' }
  }
  if (!asset?.assetId) return { ok: false, error: 'No asset selected.' }

  if (listedAssets(trade).some((a) => a.assetId === asset.assetId)) {
    return { ok: false, error: `${asset.displayName} is already on this trade.` }
  }

  const fromTeam = asset.currentTeam
  if (!teams.includes(fromTeam)) {
    return {
      ok: false,
      error: `${asset.displayName} belongs to ${fromTeam || 'nobody'}, who is not in this trade.`,
    }
  }
  const toTeam = teams.find((t) => t !== fromTeam)

  // The side arrays are what each team SENDS, so the asset joins the side
  // belonging to whoever currently holds it.
  const side = fromTeam === trade.proposingTeamName ? PROPOSER_SIDE : RECEIVER_SIDE

  return {
    ok: true,
    side,
    fromTeam,
    toTeam,
    ref: {
      assetId: asset.assetId,
      assetType: asset.assetType,
      displayName: asset.displayName,
    },
  }
}

/**
 * Undo an addition: the asset goes back to the side that sent it.
 *
 * Only ever used to correct a mistake made while repairing a trade, so it
 * reads the direction off the trade itself rather than trusting a caller to
 * remember which way it originally went.
 */
export function planAssetRemoval(trade, assetId) {
  if (!trade) return { ok: false, error: 'No trade selected.' }
  const listed = listedAssets(trade).find((a) => a.assetId === assetId)
  if (!listed) return { ok: false, error: 'That asset is not on this trade.' }

  // Whoever's side it sits on is who sent it — so that is where it returns.
  const backTo = listed.side === PROPOSER_SIDE ? trade.proposingTeamName : trade.receivingTeamName
  const from = listed.side === PROPOSER_SIDE ? trade.receivingTeamName : trade.proposingTeamName

  return { ok: true, side: listed.side, ref: listed, backTo, from }
}
