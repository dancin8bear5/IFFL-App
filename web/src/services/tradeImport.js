// tradeImport — decides what a Keeper Sheet import should and should NOT
// write. Pure, so the safety rules are testable without Firestore.
//
// The rule that matters: this import is ADDITIVE ONLY. It creates ledger
// entries that don't exist and never rewrites one that does.
//
// That is not a nicety. The importer writes whole documents, not patches,
// so rewriting an existing entry would silently discard anything added to
// it since — the hand-written "via X" provenance notes on the 2026 trades
// being the case that actually matters. A re-run must be able to fill a gap
// without costing anyone work they did by hand.
//
// To genuinely re-import a trade after correcting the sheet, delete that
// trade document first. Making the destructive path explicit is the point.

export const DUP_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

/** Deterministic id for a sheet row. Same row, same id, every run. */
export function historicalTradeId(row) {
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `hist-${row.date}-${slug(row.a.team)}-${slug(row.b.team)}`
}

const pairKey = (x, y) => [x, y].sort().join('::')

/**
 * Split sheet rows into what to write and what to leave alone.
 *
 * `existing` is every trade already in the season, each {id, date (Date),
 * proposingTeamName, receivingTeamName, status}.
 *
 * Two independent reasons to skip, checked in this order:
 *   1. This row's own entry already exists. Never rewrite it — see header.
 *   2. A completed/historical trade between the same two teams sits within
 *      the dedup window. The sheet logs every trade including the ones the
 *      app already saw (Trade Portal, ESPN auto-import), so this is what
 *      keeps those from being doubled.
 */
export function planHistoricalImport(rows, existing = [], { dupWindowMs = DUP_WINDOW_MS } = {}) {
  const byId = new Set(existing.map((t) => t.id))
  const ledger = existing.filter((t) => t.status === 'completed' || t.status === 'historical')

  const toWrite = []
  const skipped = []

  for (const row of rows ?? []) {
    const id = historicalTradeId(row)
    // Noon local keeps the date from drifting a day either way on render.
    const at = new Date(`${row.date}T12:00:00`)

    if (byId.has(id)) {
      skipped.push({ row, id, existingId: id, reason: 'already imported — left untouched' })
      continue
    }

    const clash = ledger.find(
      (t) =>
        t.id !== id &&
        pairKey(t.proposingTeamName, t.receivingTeamName) === pairKey(row.a.team, row.b.team) &&
        t.date &&
        Math.abs(new Date(t.date) - at) <= dupWindowMs,
    )
    if (clash) {
      skipped.push({
        row, id, existingId: clash.id,
        reason: `already in the ledger as ${clash.status}`,
      })
      continue
    }

    toWrite.push({ row, id, at })
  }

  return { toWrite, skipped }
}
