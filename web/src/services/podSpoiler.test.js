import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  spoilerId, isBlank, isRevealed, reveal, hide, toggle, parseStore,
} from './podSpoiler.js'

test('an id is stable and distinguishes the cells around it', () => {
  assert.equal(spoilerId('MVP', 'Jared'), 'MVP::Jared')
  assert.notEqual(spoilerId('MVP', 'Bill'), spoilerId('MVP', 'Jared'))
  assert.notEqual(spoilerId('ROY', 'Jared'), spoilerId('MVP', 'Jared'))
  assert.equal(spoilerId('Jared', 0), 'Jared::0')
})

test('everything starts hidden', () => {
  assert.equal(isRevealed({}, 'MVP::Jared', 'Bijan'), false)
})

test('a click reveals it, and a second click puts it back', () => {
  let s = toggle({}, 'MVP::Jared', 'Bijan')
  assert.equal(isRevealed(s, 'MVP::Jared', 'Bijan'), true)
  s = toggle(s, 'MVP::Jared', 'Bijan')
  assert.equal(isRevealed(s, 'MVP::Jared', 'Bijan'), false)
})

test('THE ONE THAT MATTERS: editing a revealed pick sends it back to black', () => {
  // Last season's MVP pick was revealed on the show. A new one is saved
  // into the same cell — it must NOT inherit that reveal.
  const s = reveal({}, 'MVP::Jared', 'Bijan Robinson')
  assert.equal(isRevealed(s, 'MVP::Jared', 'Bijan Robinson'), true)
  assert.equal(isRevealed(s, 'MVP::Jared', 'Jahmyr Gibbs'), false)
  // ...and a typo fix counts as a change too, which is the safe direction.
  assert.equal(isRevealed(s, 'MVP::Jared', 'Bijan Robinson '), false)
})

test('revealing one cell leaves its neighbours alone', () => {
  const s = reveal(reveal({}, 'MVP::Jared', 'Bijan'), 'MVP::Bill', 'Puka')
  assert.equal(isRevealed(s, 'MVP::Jared', 'Bijan'), true)
  assert.equal(isRevealed(s, 'MVP::Bill', 'Puka'), true)
  assert.equal(isRevealed(s, 'MVP::Zurek', 'Achane'), false)
  assert.equal(isRevealed(hide(s, 'MVP::Bill'), 'MVP::Jared', 'Bijan'), true)
})

test('blanks are never hidden and can never be revealed', () => {
  for (const v of [undefined, null, '', '   ']) {
    assert.equal(isBlank(v), true)
    assert.equal(isRevealed({}, 'x', v), false)
    // clicking a blank must not write a phantom entry
    assert.deepEqual(reveal({}, 'x', v), {})
    assert.deepEqual(toggle({}, 'x', v), {})
  }
  assert.equal(isBlank('Bijan'), false)
})

test('a value that is legitimately falsy-looking still works', () => {
  // '0' is a real answer for an over/under call.
  const s = reveal({}, 'Bears o/u::Bill', '0')
  assert.equal(isRevealed(s, 'Bears o/u::Bill', '0'), true)
})

test('stored state survives a reload, and junk in storage does not', () => {
  assert.deepEqual(parseStore(JSON.stringify({ 'MVP::Jared': 'Bijan' })), { 'MVP::Jared': 'Bijan' })
  // anything that is not a flat object of strings is thrown away
  assert.deepEqual(parseStore(null), {})
  assert.deepEqual(parseStore(''), {})
  assert.deepEqual(parseStore('not json'), {})
  assert.deepEqual(parseStore('[1,2,3]'), {})
  assert.deepEqual(parseStore('"a string"'), {})
  assert.deepEqual(parseStore('null'), {})
  assert.deepEqual(parseStore(JSON.stringify({ ok: 'yes', bad: 42, worse: { a: 1 } })), { ok: 'yes' })
})

test('the store functions never mutate what they are given', () => {
  const before = { 'MVP::Jared': 'Bijan' }
  const snapshot = { ...before }
  reveal(before, 'MVP::Bill', 'Puka')
  hide(before, 'MVP::Jared')
  toggle(before, 'MVP::Jared', 'Bijan')
  assert.deepEqual(before, snapshot)
})

test('a missing store is treated as empty rather than crashing', () => {
  assert.equal(isRevealed(null, 'x', 'y'), false)
  assert.deepEqual(reveal(null, 'x', 'y'), { x: 'y' })
  assert.deepEqual(hide(null, 'x'), {})
})
