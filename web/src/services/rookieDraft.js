// rookieDraft — shaping a rookie draft class for display.
//
// The league's rookie draft is two rounds of twelve, so a full class is
// exactly 24 picks. That happens to lay out cleanly as a 4-wide grid six
// rows deep, with the round break falling on a row boundary: rows 1–3 are
// round one, rows 4–6 are round two.
//
// Pure functions — the board only ever renders what these return, so the
// ordering and the round split are testable without a browser.

/** Positions that get their own colour, in draft-board order. */
export const DRAFT_POSITIONS = ['QB', 'RB', 'WR', 'TE']

/**
 * Sort key for a slot like "1.07" → 107, "2.11" → 211.
 *
 * Parsed rather than compared as a string because "1.10" sorts before
 * "1.9" lexically, which would silently scramble the back half of a round.
 */
export function slotOrder(slot) {
  const m = /^(\d+)\.(\d+)$/.exec(String(slot ?? '').trim())
  if (!m) return Number.MAX_SAFE_INTEGER
  return Number(m[1]) * 100 + Number(m[2])
}

/** Picks in true draft order, regardless of how the source listed them. */
export function orderPicks(picks) {
  return [...(picks ?? [])].sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot))
}

/**
 * Lay the class out as a grid.
 *
 * @param cols - cells per row (4 for the league's 24-pick class)
 * @returns [[cell, …], …] — the last row is padded with nulls so the grid
 *   stays rectangular and a short or in-progress class doesn't collapse
 *   into a ragged shape.
 */
export function toGrid(picks, cols = 4) {
  const ordered = orderPicks(picks)
  if (ordered.length === 0) return []
  const rows = []
  for (let i = 0; i < ordered.length; i += cols) {
    const row = ordered.slice(i, i + cols)
    while (row.length < cols) row.push(null)
    rows.push(row)
  }
  return rows
}

/** The round a slot belongs to, or null when it can't be read. */
export function roundOf(pick) {
  if (Number.isFinite(pick?.round)) return pick.round
  const m = /^(\d+)\./.exec(String(pick?.slot ?? ''))
  return m ? Number(m[1]) : null
}

/**
 * Headline numbers for a class: how it broke down by position, who came
 * away with the most picks, and how many slots had changed hands.
 */
export function draftSummary(picks) {
  const ordered = orderPicks(picks)
  const byPosition = {}
  const byTeam = {}
  let traded = 0

  for (const p of ordered) {
    const pos = p.position ?? '—'
    byPosition[pos] = (byPosition[pos] ?? 0) + 1
    if (p.team) byTeam[p.team] = (byTeam[p.team] ?? 0) + 1
    // `via` is only set when the slot was acquired in a trade.
    if (p.via) traded += 1
  }

  const topTeams = Object.entries(byTeam)
    .map(([team, count]) => ({ team, count }))
    .sort((a, b) => b.count - a.count || a.team.localeCompare(b.team))

  return {
    total: ordered.length,
    rounds: [...new Set(ordered.map(roundOf).filter((r) => r != null))].sort((a, b) => a - b),
    byPosition,
    topTeams,
    traded,
  }
}
