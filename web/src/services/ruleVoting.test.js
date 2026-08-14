import test from 'node:test'
import assert from 'node:assert/strict'
import { tallyVotes, banStatus, effectiveSeason, yesVotes } from './ruleVoting.js'

const votes = (yes, no = 0) => {
  const v = {}
  for (let i = 0; i < yes; i++) v[`yes${i}`] = 'yes'
  for (let i = 0; i < no; i++) v[`no${i}`] = 'no'
  return v
}
const rule = (id, category, yes, no = 0) => ({ id, title: id, category, votes: votes(yes, no) })

test('under 7 votes fails', () => {
  const { results } = tallyVotes([rule('a', 'Money', 6)])
  assert.equal(results[0].status, 'failed')
})

test('exactly 7 votes passes', () => {
  const { results } = tallyVotes([rule('a', 'Money', 7)])
  assert.equal(results[0].status, 'passed')
})

test('only one rule per limited category — highest votes wins, rest deferred', () => {
  const { results } = tallyVotes([
    rule('a', 'Money', 9),
    rule('b', 'Money', 7),
    rule('c', 'Money', 8),
  ])
  const byId = Object.fromEntries(results.map((r) => [r.id, r.status]))
  assert.equal(byId.a, 'passed')   // 9 votes
  assert.equal(byId.b, 'deferred') // resubmit next year, not a rejection
  assert.equal(byId.c, 'deferred')
})

test('Operations is unlimited — every eligible rule passes', () => {
  const { results } = tallyVotes([
    rule('a', 'Operations', 9),
    rule('b', 'Operations', 7),
    rule('c', 'Operations', 12),
  ])
  assert.ok(results.every((r) => r.status === 'passed'))
})

test('limited categories are tallied independently of each other', () => {
  const { results } = tallyVotes([
    rule('money', 'Money', 8),
    rule('scoring', 'Scoring', 8),
    rule('starters', 'Starters', 8),
  ])
  assert.ok(results.every((r) => r.status === 'passed'))
})

test('a tie for the category lead needs the Rules Committee', () => {
  const { results, needsTiebreak } = tallyVotes([
    rule('a', 'Scoring', 8),
    rule('b', 'Scoring', 8),
    rule('c', 'Scoring', 7),
  ])
  const byId = Object.fromEntries(results.map((r) => [r.id, r.status]))
  assert.equal(byId.a, 'tiebreak')
  assert.equal(byId.b, 'tiebreak')
  assert.equal(byId.c, 'deferred')
  assert.equal(needsTiebreak.length, 2)
})

test('two consecutive rejections trigger a two-year ban', () => {
  // Rejected 2024 and 2025 → eligible again in 2028
  const r = { rejectionYears: [2024, 2025] }
  assert.equal(banStatus(r, 2026).banned, true)
  assert.equal(banStatus(r, 2027).banned, true)
  assert.equal(banStatus(r, 2028).banned, false)
  assert.equal(banStatus(r, 2026).eligibleAgain, 2028)
})

test('non-consecutive rejections do not ban', () => {
  assert.equal(banStatus({ rejectionYears: [2022, 2025] }, 2026).banned, false)
  assert.equal(banStatus({ rejectionYears: [2025] }, 2026).banned, false)
  assert.equal(banStatus({}, 2026).banned, false)
})

test('Operations rules take effect immediately; others next season', () => {
  assert.equal(effectiveSeason('Operations', 2026), 2026)
  assert.equal(effectiveSeason('Money', 2026), 2027)
  assert.equal(effectiveSeason('Scoring', 2026), 2027)
})

test('yesVotes ignores no votes and missing maps', () => {
  assert.equal(yesVotes({ votes: { a: 'yes', b: 'no', c: 'yes' } }), 2)
  assert.equal(yesVotes({}), 0)
})
