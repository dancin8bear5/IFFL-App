// podAwards — who may edit which column, and how a save merges.
//
// Two rules live here, both of which are easy to get wrong in a component
// and expensive to get wrong in a shared document:
//
// 1. A HOST OWNS EXACTLY ONE COLUMN. Jared fills Jared's, Bill fills
//    Bill's, Zurek fills Zurek's — including the commissioner, who gets no
//    override. These are predictions, and a prediction someone else can
//    edit isn't one.
//
// 2. A SAVE CARRIES ONLY WHAT CHANGED. The old save replaced the entire
//    awards array, so two hosts editing the same evening meant whoever
//    saved second wiped the other out, and clearing a box wiped a pick
//    that was already there. Blanks are now ignored, every other column is
//    left exactly as found, and the merge runs against a FRESH read rather
//    than whatever was on screen when Edit was pressed.
//
// The trade-off of rule 2, stated plainly: you cannot clear a pick by
// emptying the box, because that is indistinguishable from "I didn't fill
// this one in". Retyping over it works.

/**
 * POD team name → the column that team owns. The award columns are named
 * differently from the teams (`M. Zurek` writes the `Zurek` column), and
 * differently again from the RANKINGS predictors, which use `Taylor Made`
 * where these use `Jared`. Hence an explicit map rather than a guess.
 */
export const AWARD_COLUMN_BY_TEAM = {
  Jared: 'Jared',
  Bill: 'Bill',
  'M. Zurek': 'Zurek',
}

/**
 * The column this member may write, or null for read-only.
 *
 * Null is the safe answer for anyone the map doesn't know — a POD member
 * with an unexpected team name sees the table and edits nothing, rather
 * than being handed somebody else's column.
 */
export function columnFor(userTeam, predictors) {
  const want = AWARD_COLUMN_BY_TEAM[userTeam]
  if (!want) return null
  return (predictors ?? []).includes(want) ? want : null
}

export function isBlank(value) {
  return value == null || String(value).trim() === ''
}

/**
 * Apply a draft onto the current awards, touching ONLY `column` and only
 * where the draft actually says something.
 *
 * `current` should be a fresh read, not the copy the editor started from —
 * that is what stops a save from reverting another host's work.
 */
export function mergeAwardPicks(current, draft, column) {
  const rows = current ?? []
  if (!column) return rows
  const edits = new Map((draft ?? []).map((r) => [r.category, r]))
  return rows.map((row) => {
    const edited = edits.get(row.category)
    if (!edited) return row
    const next = edited.picks?.[column]
    if (isBlank(next)) return row                     // a blank never overwrites
    if (next === row.picks?.[column]) return row      // unchanged, leave the object alone
    return { ...row, picks: { ...row.picks, [column]: next } }
  })
}

/** Did this draft actually change anything in the column its author owns? */
export function hasChanges(current, draft, column) {
  const merged = mergeAwardPicks(current, draft, column)
  return merged.some((row, i) => row !== (current ?? [])[i])
}

/**
 * Bold Calls, same rules as the awards table.
 *
 * The shape differs — `{ Jared: [...], Bill: [...], Zurek: [...] }` rather
 * than rows of picks — but the hazard is identical: one save used to
 * replace the whole object, so the second host to save that evening wiped
 * the first. Only the author's own list is applied, blank lines never
 * overwrite, and the merge runs against a fresh read.
 *
 * A list can GROW (the "+ Add call" button), so a longer draft list is
 * accepted; entries the draft leaves blank keep whatever was there.
 */
export function mergeBoldCalls(current, draft, host) {
  const base = { ...(current ?? {}) }
  if (!host) return base
  const mine = (draft ?? {})[host]
  if (!Array.isArray(mine)) return base
  const existing = Array.isArray(base[host]) ? base[host] : []
  const merged = []
  for (let i = 0; i < Math.max(existing.length, mine.length); i++) {
    const next = mine[i]
    merged.push(isBlank(next) ? existing[i] : next)
  }
  // A trailing blank added and never filled in is not a call.
  while (merged.length && isBlank(merged[merged.length - 1])) merged.pop()
  base[host] = merged
  return base
}
