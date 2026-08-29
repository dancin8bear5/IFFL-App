import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slotOrder, orderPicks, toGrid, roundOf, draftSummary, toRoundGrids, slotLabelOf } from './rookieDraft.js'
import { rookieClass2026 } from '../data/rookieDraft2026.js'

const mk = (slot, extra = {}) => ({ slot, round: Number(slot.split('.')[0]), name: `P${slot}`, position: 'WR', team: 'Jared', ...extra })

// ── slot ordering ──────────────────────────────────────────────

test('slots sort numerically, not as strings', () => {
  // "1.10" < "1.9" lexically, which would scramble the back of a round.
  const out = orderPicks([mk('1.10'), mk('1.09'), mk('1.02')]).map((p) => p.slot)
  assert.deepEqual(out, ['1.02', '1.09', '1.10'])
})

test('round two follows all of round one', () => {
  const out = orderPicks([mk('2.01'), mk('1.12'), mk('1.01')]).map((p) => p.slot)
  assert.deepEqual(out, ['1.01', '1.12', '2.01'])
})

test('an unreadable slot sorts last rather than to the front', () => {
  const out = orderPicks([mk('bogus'), mk('1.01')]).map((p) => p.slot)
  assert.deepEqual(out, ['1.01', 'bogus'])
  assert.equal(slotOrder(null), Number.MAX_SAFE_INTEGER)
})

// ── the grid ───────────────────────────────────────────────────

test('24 picks lay out 4 wide and 6 deep', () => {
  const grid = toGrid(rookieClass2026, 4)
  assert.equal(grid.length, 6)
  assert.ok(grid.every((r) => r.length === 4))
})

test('the round break lands on a row boundary', () => {
  // Rows 1-3 are round one, rows 4-6 round two. If that ever stops being
  // true the board would split a round mid-row and read wrong.
  const grid = toGrid(rookieClass2026, 4)
  const rounds = grid.map((row) => [...new Set(row.filter(Boolean).map(roundOf))])
  assert.deepEqual(rounds, [[1], [1], [1], [2], [2], [2]])
})

test('the round break also lands on a row boundary two across', () => {
  // The phone layout drops to 2 columns; 12 picks per round divides by 2
  // as cleanly as by 4, so a round never starts mid-row on either layout.
  const grid = toGrid(rookieClass2026, 2)
  assert.equal(grid.length, 12)
  const rounds = grid.map((row) => [...new Set(row.filter(Boolean).map(roundOf))])
  assert.deepEqual(rounds, [[1],[1],[1],[1],[1],[1],[2],[2],[2],[2],[2],[2]])
})

test('the grid reads left to right, top to bottom in draft order', () => {
  const grid = toGrid(rookieClass2026, 4)
  assert.equal(grid[0][0].slot, '1.01')
  assert.equal(grid[0][3].slot, '1.04')
  assert.equal(grid[1][0].slot, '1.05')
  assert.equal(grid[5][3].slot, '2.12')
})

test('a short class pads its last row instead of going ragged', () => {
  const grid = toGrid([mk('1.01'), mk('1.02'), mk('1.03')], 4)
  assert.equal(grid.length, 1)
  assert.equal(grid[0].length, 4)
  assert.equal(grid[0][3], null)
})

test('an empty class is an empty grid, not a row of nulls', () => {
  assert.deepEqual(toGrid([], 4), [])
  assert.deepEqual(toGrid(null, 4), [])
})

// ── round detection ────────────────────────────────────────────

test('round comes from the field when present, the slot otherwise', () => {
  assert.equal(roundOf({ round: 2, slot: '1.01' }), 2)
  assert.equal(roundOf({ slot: '2.05' }), 2)
  assert.equal(roundOf({}), null)
})

// ── summary ────────────────────────────────────────────────────

test('summary counts the real 2026 class', () => {
  const s = draftSummary(rookieClass2026)
  assert.equal(s.total, 24)
  assert.deepEqual(s.rounds, [1, 2])
  // Every pick belongs to exactly one position bucket.
  assert.equal(Object.values(s.byPosition).reduce((a, b) => a + b, 0), 24)
})

test('summary counts only slots that actually changed hands', () => {
  const s = draftSummary([
    mk('1.01'), mk('1.02', { via: 'via Bill' }), mk('1.03', { via: 'via Ryan' }),
  ])
  assert.equal(s.traded, 2)
})

test('teams rank by pick count, ties broken by name for a stable order', () => {
  const s = draftSummary([
    mk('1.01', { team: 'Ryan' }), mk('1.02', { team: 'Abad' }),
    mk('1.03', { team: 'Abad' }), mk('1.04', { team: 'Bill' }),
  ])
  assert.deepEqual(s.topTeams.map((t) => t.team), ['Abad', 'Bill', 'Ryan'])
  assert.equal(s.topTeams[0].count, 2)
})

test('summary of nothing is zeroes, not a crash', () => {
  const s = draftSummary([])
  assert.equal(s.total, 0)
  assert.equal(s.traded, 0)
  assert.deepEqual(s.topTeams, [])
})

// ── per-round grids ────────────────────────────────────────────

test('each round gets its own grid, so a round never starts mid-row', () => {
  const grids = toRoundGrids(rookieClass2026, 4)
  assert.deepEqual(grids.map((g) => g.round), [1, 2])
  assert.equal(grids[0].rows.length, 3)
  assert.equal(grids[1].rows.length, 3)
})

test('a lopsided class still breaks cleanly between rounds', () => {
  // 2017 came back 8 and 10. Gridded as one class that would put round two
  // halfway along a row; per round it can't.
  const lopsided = [
    ...Array.from({ length: 8 }, (_, i) => ({ round: 1, slot: null, name: `a${i}` })),
    ...Array.from({ length: 10 }, (_, i) => ({ round: 2, slot: null, name: `b${i}` })),
  ]
  const grids = toRoundGrids(lopsided, 4)
  assert.deepEqual(grids.map((g) => g.round), [1, 2])
  assert.equal(grids[0].rows.flat().filter(Boolean).length, 8)
  assert.equal(grids[1].rows.flat().filter(Boolean).length, 10)
  for (const g of grids) {
    const rounds = new Set(g.rows.flat().filter(Boolean).map(roundOf))
    assert.equal(rounds.size, 1)
  }
})

test('an empty class has no rounds rather than one empty one', () => {
  assert.deepEqual(toRoundGrids([], 4), [])
})

test('a slot with no recoverable number falls back to its round', () => {
  assert.equal(slotLabelOf({ slot: '1.01', round: 1 }), '1.01')
  assert.equal(slotLabelOf({ slot: null, round: 2 }), 'R2')
  assert.equal(slotLabelOf({}), '')
})
