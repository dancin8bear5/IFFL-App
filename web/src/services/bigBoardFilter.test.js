import { test } from 'node:test'
import assert from 'node:assert/strict'
import { callOf, matchesFilters, filterBoard, callCounts } from './bigBoardFilter.js'

const ROWS = [
  { player: "Ja'Marr Chase",   pos: 'WR', team: 'JRDP', kdm: 'D' },
  { player: 'Bijan Robinson',  pos: 'RB', team: 'PNP',  kdm: 'K' },
  { player: 'Lamar Jackson',   pos: 'QB', team: 'BF',   kdm: 'K' },
  { player: 'Jordan Love',     pos: 'QB', team: 'DPGE', kdm: 'M' },
  { player: 'Rookie McUncalled', pos: 'WR', team: 'BF' },   // never called
]

// ── the missing-call rule ──────────────────────────────────────

test('a row with no call counts as Maybe, matching its badge', () => {
  assert.equal(callOf({ player: 'x' }), 'M')
  assert.equal(callOf({ kdm: 'D' }), 'D')
  assert.equal(callOf(null), 'M')
})

test('filtering to Maybe includes the never-called rows', () => {
  // The board displays "M" for these, so hiding them here would make the
  // filter look broken on a freshly imported list.
  const out = filterBoard(ROWS, { kdm: 'M' })
  assert.deepEqual(out.map((r) => r.player), ['Jordan Love', 'Rookie McUncalled'])
})

// ── each call ──────────────────────────────────────────────────

test('Keep and Drop select only their own rows', () => {
  assert.deepEqual(filterBoard(ROWS, { kdm: 'K' }).map((r) => r.player),
    ['Bijan Robinson', 'Lamar Jackson'])
  assert.deepEqual(filterBoard(ROWS, { kdm: 'D' }).map((r) => r.player),
    ["Ja'Marr Chase"])
})

test('ALL leaves every row', () => {
  assert.equal(filterBoard(ROWS, { kdm: 'ALL' }).length, ROWS.length)
  assert.equal(filterBoard(ROWS, {}).length, ROWS.length)
})

test('the three calls partition the board exactly', () => {
  const k = filterBoard(ROWS, { kdm: 'K' }).length
  const m = filterBoard(ROWS, { kdm: 'M' }).length
  const d = filterBoard(ROWS, { kdm: 'D' }).length
  assert.equal(k + m + d, ROWS.length)   // nothing lost, nothing double-counted
})

// ── combining with the existing filters ────────────────────────

test('call stacks with position', () => {
  assert.deepEqual(filterBoard(ROWS, { kdm: 'K', pos: 'QB' }).map((r) => r.player),
    ['Lamar Jackson'])
})

test('call stacks with team', () => {
  assert.deepEqual(filterBoard(ROWS, { kdm: 'M', team: 'BF' }).map((r) => r.player),
    ['Rookie McUncalled'])
})

test('call stacks with search', () => {
  assert.deepEqual(filterBoard(ROWS, { kdm: 'K', search: 'bij' }).map((r) => r.player),
    ['Bijan Robinson'])
})

test('a combination matching nothing is empty, not everything', () => {
  assert.deepEqual(filterBoard(ROWS, { kdm: 'D', pos: 'QB' }), [])
})

// ── robustness ─────────────────────────────────────────────────

test('team matching is case-insensitive', () => {
  assert.equal(filterBoard(ROWS, { team: 'bf' }).length, 2)
})

test('search ignores surrounding whitespace and case', () => {
  assert.deepEqual(filterBoard(ROWS, { search: '  LAMAR ' }).map((r) => r.player),
    ['Lamar Jackson'])
})

test('a null row list is empty, not a crash', () => {
  assert.deepEqual(filterBoard(null, { kdm: 'K' }), [])
  assert.deepEqual(filterBoard(undefined, {}), [])
})

test('a row missing fields does not throw', () => {
  assert.equal(matchesFilters({}, { kdm: 'M' }), true)
  assert.equal(matchesFilters({}, { team: 'BF' }), false)
})

// ── chip counts ────────────────────────────────────────────────

test('call counts respect the other filters but not the call itself', () => {
  const c = callCounts(ROWS, { team: 'BF' })
  assert.equal(c.ALL, 2)   // Lamar + the uncalled rookie
  assert.equal(c.K, 1)
  assert.equal(c.M, 1)
  assert.equal(c.D, 0)
})

test('call counts ignore a call already selected, so a chip never reads 0 wrongly', () => {
  // Counts are computed as if no call filter were applied — otherwise
  // selecting Keep would make every other chip show 0.
  const withK = callCounts(ROWS, { kdm: 'K' })
  const none = callCounts(ROWS, {})
  assert.deepEqual(withK, none)
})
