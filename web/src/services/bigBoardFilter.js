// bigBoardFilter — which rows the Big Board is currently showing.
//
// Pulled out of the view so the rules are testable without Firestore. The
// board only loads from a live collection, so a bug in here would
// otherwise only ever surface in production, on the commissioner's screen,
// during the auction.

/**
 * The keep/maybe/drop call for a row.
 *
 * A row that has never been given one displays as "M" on its badge, so it
 * has to FILTER as Maybe too. Treating a missing value as its own state
 * would hide most of the board behind Maybe and make the filter look
 * broken on a freshly imported list, where nothing has been called yet.
 */
export const callOf = (row) => row?.kdm ?? 'M'

/**
 * @param filters - { pos, team, kdm, search } — 'ALL' means no constraint
 *   on that axis, and search is matched against the player name.
 */
export function matchesFilters(row, filters = {}) {
  const { pos = 'ALL', team = 'ALL', kdm = 'ALL', search = '' } = filters
  if (!row) return false
  if (pos !== 'ALL' && row.pos !== pos) return false
  if (team !== 'ALL' && String(row.team ?? '').toUpperCase() !== String(team).toUpperCase()) return false
  if (kdm !== 'ALL' && callOf(row) !== kdm) return false
  const q = String(search ?? '').trim().toLowerCase()
  if (q && !String(row.player ?? '').toLowerCase().includes(q)) return false
  return true
}

/** Every row still standing after the current filters. */
export function filterBoard(rows, filters) {
  return (rows ?? []).filter((r) => matchesFilters(r, filters))
}

/**
 * How many rows each keep/maybe/drop call would leave, given the OTHER
 * filters. Lets a chip show its own count without lying about what
 * tapping it would do.
 */
export function callCounts(rows, filters = {}) {
  const rest = { ...filters, kdm: 'ALL' }
  const base = filterBoard(rows, rest)
  return {
    ALL: base.length,
    K: base.filter((r) => callOf(r) === 'K').length,
    M: base.filter((r) => callOf(r) === 'M').length,
    D: base.filter((r) => callOf(r) === 'D').length,
  }
}
