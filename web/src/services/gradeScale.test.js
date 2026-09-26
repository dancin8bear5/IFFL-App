import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GRADE_POINTS, gradeValue, pairValue } from './gradeScale.js'

test('THE ONE THAT MATTERS: A+ outranks A outranks A-', () => {
  // Alphabetically "A" < "A+" < "A-", which would put the best team third.
  assert.ok(gradeValue('A+') > gradeValue('A'))
  assert.ok(gradeValue('A') > gradeValue('A-'))
  assert.ok(gradeValue('A-') > gradeValue('B+'))
  // ...and the whole ladder is strictly descending
  const order = ['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-','F']
  for (let i = 1; i < order.length; i++) {
    assert.ok(gradeValue(order[i - 1]) > gradeValue(order[i]), `${order[i-1]} > ${order[i]}`)
  }
})

test('sorting real grades gives the real order', () => {
  const grades = ['C+', 'A+', 'B-', 'D+', 'A', 'B+', 'C-']
  const sorted = [...grades].sort((a, b) => gradeValue(b) - gradeValue(a))
  assert.deepEqual(sorted, ['A+', 'A', 'B+', 'B-', 'C+', 'C-', 'D+'])
  // the naive version this replaces gets it wrong
  const naive = [...grades].sort().reverse()
  assert.notDeepEqual(naive, sorted)
})

test("Abad's annotated grade sorts as its letter", () => {
  assert.equal(gradeValue('B (with Watson)'), GRADE_POINTS.B)
  assert.equal(gradeValue('B (with Watson)'), gradeValue('B'))
})

test('any flavour of dash means minus', () => {
  for (const dash of ['-', '‐', '‑', '‒', '–', '—', '−']) {
    assert.equal(gradeValue(`B${dash}`), GRADE_POINTS['B-'], JSON.stringify(dash))
  }
})

test('whitespace and case do not change a grade', () => {
  assert.equal(gradeValue('  a+  '), GRADE_POINTS['A+'])
  assert.equal(gradeValue('b-'), GRADE_POINTS['B-'])
})

test('an unknown or missing grade is null, never zero', () => {
  // Zero would sort a missing grade as an F, which is a different claim.
  for (const bad of [null, undefined, '', '   ', 'N/A', 'Z', 42, {}]) {
    assert.equal(gradeValue(bad), null, String(bad))
  }
  assert.equal(gradeValue('F'), 0, 'an actual F is zero, and that is not null')
})

test('the Bench/Owner pair sorts on its mean', () => {
  assert.equal(pairValue('A', 'A'), GRADE_POINTS.A)
  assert.equal(pairValue('D', 'A'), (GRADE_POINTS.D + GRADE_POINTS.A) / 2)
  // "D / A" and "A / D" are the same cell value, so they tie
  assert.equal(pairValue('D', 'A'), pairValue('A', 'D'))
  // a better pair beats a worse one
  assert.ok(pairValue('B+', 'A') > pairValue('C', 'B'))
})

test('a half-missing pair falls back to the grade that exists', () => {
  assert.equal(pairValue('B', null), GRADE_POINTS.B)
  assert.equal(pairValue(null, 'B'), GRADE_POINTS.B)
  assert.equal(pairValue(null, null), null)
})
