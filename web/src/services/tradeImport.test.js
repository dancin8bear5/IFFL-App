import test from 'node:test'
import assert from 'node:assert/strict'
import { planHistoricalImport, historicalTradeId, DUP_WINDOW_MS } from './tradeImport.js'
import { trades2026 } from '../data/trades2026.js'

const row = (date, a, b) => ({ date, a: { team: a, received: [] }, b: { team: b, received: [] } })
const swap = row('2026-08-04', 'Dugan', 'M. Zurek')

test('ids are deterministic and slug both teams', () => {
  assert.equal(historicalTradeId(swap), 'hist-2026-08-04-dugan-m-zurek')
  assert.equal(historicalTradeId(swap), historicalTradeId(swap))
})

test('a fresh ledger writes every row', () => {
  const { toWrite, skipped } = planHistoricalImport(trades2026, [])
  assert.equal(toWrite.length, trades2026.length)
  assert.equal(skipped.length, 0)
})

// ── The rule that protects hand-written notes ─────────────────────────
test('an entry this import already created is NEVER rewritten', () => {
  const existing = [{
    id: historicalTradeId(swap),
    proposingTeamName: 'Dugan', receivingTeamName: 'M. Zurek',
    date: new Date('2026-08-04T12:00:00'), status: 'historical',
  }]
  const { toWrite, skipped } = planHistoricalImport([swap], existing)
  assert.equal(toWrite.length, 0, 'rewriting would discard the via-X notes')
  assert.equal(skipped[0].reason, 'already imported — left untouched')
})

test('re-running the real import over its own output writes nothing at all', () => {
  // Simulate a completed first run, then run again.
  const first = planHistoricalImport(trades2026, [])
  const asDocs = first.toWrite.map(({ row: r, id, at }) => ({
    id,
    proposingTeamName: r.a.team,
    receivingTeamName: r.b.team,
    date: at,
    status: 'historical',
  }))
  const second = planHistoricalImport(trades2026, asDocs)
  assert.equal(second.toWrite.length, 0, 'a second run must be a complete no-op')
  assert.equal(second.skipped.length, trades2026.length)
  for (const s of second.skipped) {
    assert.match(s.reason, /left untouched/)
  }
})

test('a gap is still filled when only some entries exist', () => {
  const first = planHistoricalImport(trades2026, [])
  // Everything landed except the last row — a partial/failed earlier run.
  const asDocs = first.toWrite.slice(0, -1).map(({ row: r, id, at }) => ({
    id, proposingTeamName: r.a.team, receivingTeamName: r.b.team, date: at, status: 'historical',
  }))
  const second = planHistoricalImport(trades2026, asDocs)
  assert.equal(second.toWrite.length, 1, 'the missing entry must still import')
  assert.equal(second.toWrite[0].id, first.toWrite.at(-1).id)
})

// ── The rule that prevents doubling app-native trades ─────────────────
test('a same-pair trade inside the window is skipped as a duplicate', () => {
  const existing = [{
    id: 'portal-abc',
    proposingTeamName: 'M. Zurek', receivingTeamName: 'Dugan', // reversed order
    date: new Date('2026-08-05T09:00:00'),
    status: 'completed',
  }]
  const { toWrite, skipped } = planHistoricalImport([swap], existing)
  assert.equal(toWrite.length, 0)
  assert.equal(skipped[0].existingId, 'portal-abc')
  assert.match(skipped[0].reason, /already in the ledger as completed/)
})

test('the same pair outside the window is a different trade, and imports', () => {
  const existing = [{
    id: 'portal-old',
    proposingTeamName: 'Dugan', receivingTeamName: 'M. Zurek',
    date: new Date(new Date('2026-08-04T12:00:00').getTime() - DUP_WINDOW_MS - 60_000),
    status: 'completed',
  }]
  assert.equal(planHistoricalImport([swap], existing).toWrite.length, 1)
})

test('a proposed or declined trade does not block an import', () => {
  for (const status of ['proposed', 'rejected', 'countered']) {
    const existing = [{
      id: 'pending-1', proposingTeamName: 'Dugan', receivingTeamName: 'M. Zurek',
      date: new Date('2026-08-04T12:00:00'), status,
    }]
    assert.equal(
      planHistoricalImport([swap], existing).toWrite.length, 1,
      `${status} is not a ledger entry`,
    )
  }
})

test('a different pair on the same date is untouched by the dedup', () => {
  const existing = [{
    id: 'other', proposingTeamName: 'Bill', receivingTeamName: 'Foley',
    date: new Date('2026-08-04T12:00:00'), status: 'completed',
  }]
  assert.equal(planHistoricalImport([swap], existing).toWrite.length, 1)
})

test('empty and missing inputs do not throw', () => {
  assert.deepEqual(planHistoricalImport([], []).toWrite, [])
  assert.deepEqual(planHistoricalImport(null).toWrite, [])
  assert.deepEqual(planHistoricalImport(undefined, undefined).skipped, [])
})
