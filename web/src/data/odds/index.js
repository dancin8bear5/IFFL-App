// The championship odds, edition by edition.
//
// One module per year, newest first. The newest IS the current edition —
// data/preseasonOdds.js re-exports it for the Dashboard, and everything
// older is what the archive lists. Publishing next year's odds is adding a
// module and a line here; last year's retires itself in the same edit.
//
// BUNDLED, not in Firestore. The rankings live in Firestore because of the
// embargo — per-drop documents are what stop an unreleased write-up
// reaching a browser. The odds have no embargo: they are published whole,
// the prose has to be structured into tiers and prices by hand anyway, so a
// deploy happens either way, and an edition is about 6KB. Worth revisiting
// if the odds ever want a staged reveal, or somewhere past a decade of
// them, when the corpus would be worth loading on demand.
import * as odds2026 from './2026.js'

/**
 * Every team on a board, in odds order, numbered 1-12. The rank is
 * positional — it is not in the source text and is not a claim the author
 * made, it is just where the entry sits on the board.
 */
function withBoard(edition) {
  const board = edition.tiers
    .flatMap((tier) => tier.teams.map((t) => ({ ...t, tier })))
    .map((t, i) => ({ ...t, rank: i + 1 }))
  return { season: edition.season, title: edition.title, date: edition.date, tiers: edition.tiers, board }
}

/** Newest first. */
export const ODDS_EDITIONS = [odds2026].map(withBoard).sort((a, b) => b.season - a.season)

export const currentOdds = ODDS_EDITIONS[0]

export const oddsForSeason = (season) =>
  ODDS_EDITIONS.find((e) => String(e.season) === String(season)) ?? null
