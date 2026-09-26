// The current championship odds.
//
// A pointer, not content: the editions live in data/odds/, newest first,
// and this re-exports whichever one is current so the Dashboard and the
// odds board don't have to know which year it is. Publishing a new edition
// therefore changes nothing here — see data/odds/index.js.
import { currentOdds } from './odds/index.js'

/** The season these odds are for. The board retires itself after it. */
export const ODDS_SEASON = currentOdds.season

export const ODDS_TITLE = currentOdds.title

export const oddsTiers = currentOdds.tiers

export const oddsBoard = currentOdds.board
