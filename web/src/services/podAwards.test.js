import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AWARD_COLUMN_BY_TEAM, columnFor, isBlank, mergeAwardPicks, hasChanges, mergeBoldCalls,
} from './podAwards.js'

const PRED = ['Jared', 'Bill', 'Zurek']
const base = () => [
  { category: 'MVP', picks: { Jared: 'Bijan', Bill: 'Bucky', Zurek: 'Gibbs' } },
  { category: 'Bust', picks: { Jared: 'Jameson', Bill: 'AJ Brown', Zurek: 'Rashee' } },
]

test('each host owns exactly one column, commissioner included', () => {
  assert.equal(columnFor('Jared', PRED), 'Jared')
  assert.equal(columnFor('Bill', PRED), 'Bill')
  assert.equal(columnFor('M. Zurek', PRED), 'Zurek')
  assert.equal(Object.keys(AWARD_COLUMN_BY_TEAM).length, 3)
})

test('anyone the map does not know is READ-ONLY, not handed a column', () => {
  for (const t of ['Abad', 'Wayne', '', null, undefined, 'Zurek', 'M Zurek']) {
    assert.equal(columnFor(t, PRED), null, String(t))
  }
  // ...and a known team whose column isn't in this edition is also read-only
  assert.equal(columnFor('Bill', ['Jared', 'Zurek']), null)
  assert.equal(columnFor('Bill', []), null)
})

test('THE ONE THAT MATTERS: a blank never overwrites an existing pick', () => {
  const draft = base()
  draft[0].picks.Jared = ''
  draft[1].picks.Jared = '   '
  const out = mergeAwardPicks(base(), draft, 'Jared')
  assert.equal(out[0].picks.Jared, 'Bijan')
  assert.equal(out[1].picks.Jared, 'Jameson')
})

test('a save touches only the column its author owns', () => {
  // A draft that has (somehow) changed every column...
  const draft = base()
  draft[0].picks.Jared = 'Saquon'
  draft[0].picks.Bill = 'HACKED'
  draft[0].picks.Zurek = 'HACKED'
  const out = mergeAwardPicks(base(), draft, 'Jared')
  assert.equal(out[0].picks.Jared, 'Saquon', 'own column applies')
  assert.equal(out[0].picks.Bill, 'Bucky', 'someone else untouched')
  assert.equal(out[0].picks.Zurek, 'Gibbs', 'someone else untouched')
})

test("a stale draft cannot revert another host's newer pick", () => {
  // Jared opened Edit when Bill's MVP said "Bucky"; Bill has since changed it.
  const staleDraft = base()
  staleDraft[0].picks.Jared = 'Saquon'
  const fresh = base()
  fresh[0].picks.Bill = 'Javonte'          // landed while Jared was typing
  const out = mergeAwardPicks(fresh, staleDraft, 'Jared')
  assert.equal(out[0].picks.Bill, 'Javonte', "Bill's newer pick survives")
  assert.equal(out[0].picks.Jared, 'Saquon')
})

test('no column means no writes at all', () => {
  const draft = base()
  draft[0].picks.Jared = 'Saquon'
  assert.deepEqual(mergeAwardPicks(base(), draft, null), base())
  assert.deepEqual(mergeAwardPicks(base(), draft, undefined), base())
})

test('rows are only replaced when they actually change', () => {
  const current = base()
  const out = mergeAwardPicks(current, base(), 'Jared')
  assert.equal(out[0], current[0], 'unchanged row is the same object')
  assert.equal(out[1], current[1])
})

test('a category missing from the draft is left alone', () => {
  const draft = [base()[0]]
  draft[0].picks.Jared = 'Saquon'
  const out = mergeAwardPicks(base(), draft, 'Jared')
  assert.equal(out[0].picks.Jared, 'Saquon')
  assert.equal(out[1].picks.Jared, 'Jameson')
  assert.equal(out.length, 2, 'the merge never drops a category')
})

test('a category only in the draft is NOT invented', () => {
  // The category list is the document's, not the editor's.
  const draft = [...base(), { category: 'New', picks: { Jared: 'x' } }]
  assert.equal(mergeAwardPicks(base(), draft, 'Jared').length, 2)
})

test('missing data degrades to empty rather than throwing', () => {
  assert.deepEqual(mergeAwardPicks(null, null, 'Jared'), [])
  assert.deepEqual(mergeAwardPicks([], null, 'Jared'), [])
  assert.deepEqual(mergeAwardPicks(base(), null, 'Jared'), base())
  assert.deepEqual(mergeAwardPicks([{ category: 'MVP' }], [{ category: 'MVP', picks: { Jared: 'x' } }], 'Jared'),
    [{ category: 'MVP', picks: { Jared: 'x' } }])
})

test('hasChanges only fires on a real edit in your own column', () => {
  assert.equal(hasChanges(base(), base(), 'Jared'), false)
  const blanked = base(); blanked[0].picks.Jared = ''
  assert.equal(hasChanges(base(), blanked, 'Jared'), false, 'blanking is not a change')
  const other = base(); other[0].picks.Bill = 'Changed'
  assert.equal(hasChanges(base(), other, 'Jared'), false, "someone else's column is not your change")
  const mine = base(); mine[0].picks.Jared = 'Saquon'
  assert.equal(hasChanges(base(), mine, 'Jared'), true)
})

test('isBlank treats whitespace as empty', () => {
  for (const v of [null, undefined, '', ' ', '\t\n']) assert.equal(isBlank(v), true)
  assert.equal(isBlank('0'), false)
  assert.equal(isBlank('Bijan'), false)
})

// ── Bold Calls ────────────────────────────────────────────────
const calls = () => ({
  Jared: ['j one', 'j two'],
  Bill: ['b one', 'b two'],
  Zurek: ['z one', 'z two'],
})

test('bold calls: a blank line never overwrites an existing call', () => {
  const draft = calls()
  draft.Jared = ['', '   ']
  assert.deepEqual(mergeBoldCalls(calls(), draft, 'Jared').Jared, ['j one', 'j two'])
})

test('bold calls: a save touches only the author', () => {
  const draft = calls()
  draft.Jared = ['changed', 'j two']
  draft.Bill = ['HACKED', 'HACKED']
  const out = mergeBoldCalls(calls(), draft, 'Jared')
  assert.deepEqual(out.Jared, ['changed', 'j two'])
  assert.deepEqual(out.Bill, ['b one', 'b two'])
  assert.deepEqual(out.Zurek, ['z one', 'z two'])
})

test("bold calls: a stale draft cannot revert another host", () => {
  const stale = calls()
  stale.Jared = ['changed', 'j two']
  const fresh = calls()
  fresh.Bill = ['bill wrote this while jared typed', 'b two']
  const out = mergeBoldCalls(fresh, stale, 'Jared')
  assert.equal(out.Bill[0], 'bill wrote this while jared typed')
  assert.equal(out.Jared[0], 'changed')
})

test('bold calls: the list can grow, and an unfilled new line is dropped', () => {
  const draft = calls()
  draft.Jared = ['j one', 'j two', 'a third call']
  assert.deepEqual(mergeBoldCalls(calls(), draft, 'Jared').Jared, ['j one', 'j two', 'a third call'])
  // "+ Add call" then Save without typing leaves no empty call behind
  const empty = calls()
  empty.Jared = ['j one', 'j two', '']
  assert.deepEqual(mergeBoldCalls(calls(), empty, 'Jared').Jared, ['j one', 'j two'])
})

test('bold calls: no host, or a malformed draft, writes nothing', () => {
  assert.deepEqual(mergeBoldCalls(calls(), calls(), null), calls())
  assert.deepEqual(mergeBoldCalls(calls(), { Jared: 'not a list' }, 'Jared'), calls())
  assert.deepEqual(mergeBoldCalls(calls(), null, 'Jared'), calls())
  assert.deepEqual(mergeBoldCalls(null, null, 'Jared'), {})
})

test('bold calls: a host with nothing yet can write their first calls', () => {
  const out = mergeBoldCalls({ Bill: ['b one'] }, { Jared: ['first'] }, 'Jared')
  assert.deepEqual(out.Jared, ['first'])
  assert.deepEqual(out.Bill, ['b one'])
})
