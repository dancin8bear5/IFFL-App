import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveLayout, toStored, moveSection, setColumn } from './dashboardLayout.js'
import { DASHBOARD_SECTIONS } from './dashboardSections.js'

// A fixture rather than the real registry for the rule tests: the rules have
// to hold for any registry, and coupling them to today's Dashboard means the
// suite breaks every time a section is added. The real registry is exercised
// separately, at the bottom, for the one thing that IS about it.
const REG = [
  { key: 'a', label: 'A' },
  { key: 'b', label: 'B', rail: true, railSafe: true },
  { key: 'c', label: 'C' },
  { key: 'd', label: 'D', rail: true, railSafe: true },
]

const keys = (list) => list.map((s) => s.key)
const cols = (list) => list.map((s) => (s.rail ? 'rail' : 'main'))

test('no override is the registry, order and columns unchanged', () => {
  for (const stored of [undefined, null, [], 'nope', 42, {}]) {
    const out = resolveLayout(REG, stored)
    assert.deepEqual(keys(out), ['a', 'b', 'c', 'd'], `stored=${JSON.stringify(stored)}`)
    assert.deepEqual(cols(out), ['main', 'rail', 'main', 'rail'])
  }
})

test('a stored layout reorders and re-columns', () => {
  const out = resolveLayout(REG, [
    { key: 'd', column: 'rail' },
    { key: 'c', column: 'main' },
    { key: 'b', column: 'main' },
    { key: 'a', column: 'main' },
  ])
  assert.deepEqual(keys(out), ['d', 'c', 'b', 'a'])
  assert.deepEqual(cols(out), ['rail', 'main', 'main', 'main'])
})

test('a section missing from the stored layout keeps its registry position', () => {
  // 'c' is not mentioned; it belongs after 'b', not at the end.
  const out = resolveLayout(REG, [
    { key: 'd', column: 'rail' },
    { key: 'a', column: 'main' },
    { key: 'b', column: 'rail' },
  ])
  assert.deepEqual(keys(out), ['d', 'a', 'b', 'c'])
})

test('consecutive newcomers keep their order relative to each other', () => {
  const reg = [...REG, { key: 'e', label: 'E' }, { key: 'f', label: 'F' }]
  const out = resolveLayout(reg, [{ key: 'd' }, { key: 'a' }])
  // b, c follow a (their registry predecessor present is 'a'); e and f follow d.
  assert.deepEqual(keys(out), ['d', 'e', 'f', 'a', 'b', 'c'])
})

test('a newcomer with no earlier neighbour in the layout goes to the front', () => {
  const out = resolveLayout(REG, [{ key: 'c' }, { key: 'd' }])
  assert.deepEqual(keys(out), ['a', 'b', 'c', 'd'])
})

test('an unknown stored key is ignored, not rendered', () => {
  // 'd' is unmentioned and follows 'c' in the registry, so it travels with
  // it — that is rule 1 doing its job, not the stored order leaking.
  const out = resolveLayout(REG, [{ key: 'gone' }, { key: 'c' }, { key: 'a' }])
  assert.deepEqual(keys(out), ['c', 'd', 'a', 'b'])
})

test('duplicates in the stored layout collapse to the first mention', () => {
  const out = resolveLayout(REG, [
    { key: 'c', column: 'main' },
    { key: 'c', column: 'rail' },
    { key: 'a' },
  ])
  assert.deepEqual(keys(out), ['c', 'd', 'a', 'b'])
  assert.equal(out[0].rail, false)
})

test('malformed entries are skipped without taking the layout down with them', () => {
  const out = resolveLayout(REG, [null, 'c', { column: 'rail' }, { key: 'd' }, { key: 5 }])
  assert.deepEqual(keys(out), ['a', 'b', 'c', 'd'])
  assert.equal(out[3].rail, true)
})

test('a section that is not rail-safe cannot be put in the rail, however it was stored', () => {
  const out = resolveLayout(REG, [{ key: 'a', column: 'rail' }])
  assert.equal(out.find((s) => s.key === 'a').rail, false)
})

test('an unrecognised column falls back to the registry default', () => {
  const out = resolveLayout(REG, [{ key: 'b', column: 'sidebar' }])
  assert.equal(out.find((s) => s.key === 'b').rail, true)
})

test('toStored round-trips a resolved layout', () => {
  const stored = [{ key: 'd', column: 'rail' }, { key: 'a', column: 'main' }]
  const once = resolveLayout(REG, stored)
  const twice = resolveLayout(REG, toStored(once))
  assert.deepEqual(keys(twice), keys(once))
  assert.deepEqual(cols(twice), cols(once))
})

// ── moving ───────────────────────────────────────────────────

test('up and down move within a column, skipping the other one', () => {
  const list = resolveLayout(REG, null)          // a(main) b(rail) c(main) d(rail)
  const moved = moveSection(list, 'c', 'up')     // c should pass b and land above a
  assert.deepEqual(keys(moved), ['c', 'a', 'b', 'd'])
  assert.deepEqual(cols(moved), ['main', 'main', 'rail', 'rail'])
})

test('moving past the end of a column is a no-op, not a wrap', () => {
  const list = resolveLayout(REG, null)
  assert.deepEqual(keys(moveSection(list, 'a', 'up')), ['a', 'b', 'c', 'd'])
  assert.deepEqual(keys(moveSection(list, 'd', 'down')), ['a', 'b', 'c', 'd'])
  assert.deepEqual(keys(moveSection(list, 'nope', 'up')), ['a', 'b', 'c', 'd'])
})

test('a section changing column lands at the end of the new one', () => {
  const list = resolveLayout(REG, null)
  const moved = setColumn(list, 'b', 'main')
  assert.deepEqual(keys(moved), ['a', 'c', 'b', 'd'])
  assert.equal(moved.find((s) => s.key === 'b').rail, false)
})

test('setColumn refuses a section that is not rail-safe', () => {
  const list = resolveLayout(REG, null)
  assert.deepEqual(setColumn(list, 'a', 'rail'), list)
})

test('setColumn to the column it is already in changes nothing', () => {
  const list = resolveLayout(REG, null)
  assert.deepEqual(setColumn(list, 'b', 'rail'), list)
})

// ── the real registry ────────────────────────────────────────

test('with no override the live registry reproduces today’s Dashboard exactly', () => {
  const out = resolveLayout(DASHBOARD_SECTIONS, null)
  assert.deepEqual(keys(out), DASHBOARD_SECTIONS.map((s) => s.key))
  assert.deepEqual(
    keys(out.filter((s) => s.rail)),
    ['rankings', 'odds', 'rules', 'history', 'match'],
  )
})

test('every rail default in the live registry is rail-safe', () => {
  for (const s of DASHBOARD_SECTIONS) {
    if (s.rail) assert.equal(s.railSafe, true, `${s.key} defaults to the rail but is not rail-safe`)
  }
})

test('live registry keys are unique', () => {
  const ks = DASHBOARD_SECTIONS.map((s) => s.key)
  assert.equal(new Set(ks).size, ks.length)
})
