import test from 'node:test'
import assert from 'node:assert/strict'
import { computeTrueRecord, parseWeekScores } from './trueRecord.js'

const week = (w, pairs) => ({ week: w, scores: pairs.map(([teamName, points]) => ({ teamName, points })) })

test('single week: top scorer goes 11-0, bottom goes 0-11', () => {
  const teams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
  const rows = computeTrueRecord([week(1, teams.map((t, i) => [t, 200 - i * 10]))])
  assert.equal(rows.length, 12)
  assert.deepEqual([rows[0].teamName, rows[0].wins, rows[0].losses], ['A', 11, 0])
  assert.deepEqual([rows[11].teamName, rows[11].wins, rows[11].losses], ['L', 0, 11])
})

test('every week distributes exactly the same total wins as losses', () => {
  const rows = computeTrueRecord([week(1, [['A', 100], ['B', 90], ['C', 80], ['D', 70]])])
  const totalWins = rows.reduce((s, r) => s + r.wins, 0)
  const totalLosses = rows.reduce((s, r) => s + r.losses, 0)
  assert.equal(totalWins, totalLosses)
  assert.equal(totalWins, 6) // 3+2+1+0 for a 4-team week
})

test('ties split the contested win slots instead of inventing wins', () => {
  const rows = computeTrueRecord([week(1, [['A', 100], ['B', 90], ['C', 90], ['D', 70]])])
  const b = rows.find((r) => r.teamName === 'B')
  const c = rows.find((r) => r.teamName === 'C')
  assert.equal(b.wins, c.wins)
  assert.equal(b.wins, 1.5) // slots worth 2 and 1, shared
  assert.equal(rows.reduce((s, r) => s + r.wins, 0), 6) // total preserved
})

test('accumulates across multiple weeks', () => {
  const rows = computeTrueRecord([
    week(1, [['A', 100], ['B', 90], ['C', 80]]),
    week(2, [['A', 50], ['B', 95], ['C', 85]]),
  ])
  const a = rows.find((r) => r.teamName === 'A')
  assert.equal(a.wins, 2) // 2 in week 1, 0 in week 2
  assert.equal(a.pointsFor, 150)
  assert.equal(a.weeksPlayed, 2)
  const b = rows.find((r) => r.teamName === 'B')
  assert.equal(b.wins, 3) // 1 + 2
})

test('sorts by true win pct, breaking ties on points scored', () => {
  const rows = computeTrueRecord([
    week(1, [['A', 100], ['B', 90], ['C', 80]]),
    week(2, [['A', 150], ['B', 90], ['C', 80]]),
  ])
  assert.deepEqual(rows.map((r) => r.teamName), ['A', 'B', 'C'])

  // Same true record (both 2-2 across the two weeks), so total points decides.
  const tied = computeTrueRecord([
    week(1, [['X', 100], ['Y', 90]]),
    week(2, [['X', 70], ['Y', 200]]),
  ])
  assert.equal(tied[0].wins, tied[1].wins)
  assert.equal(tied[0].teamName, 'Y') // 290 pts beats 170
})

test('luck column compares actual wins against the true-record rate over games actually played', () => {
  const rows = computeTrueRecord(
    [week(1, [['A', 100], ['B', 90], ['C', 80]]), week(2, [['A', 100], ['B', 90], ['C', 80]])],
    { A: { wins: 0, losses: 2 }, B: { wins: 1, losses: 1 }, C: { wins: 2, losses: 0 } },
  )
  const a = rows.find((r) => r.teamName === 'A')
  const c = rows.find((r) => r.teamName === 'C')
  // A dominated every week (4-0 true) but actually went 0-2 -> very unlucky
  assert.equal(a.wins, 4)
  assert.ok(a.luck < 0, 'best scorer with worst record should show negative luck')
  // C was worst every week (0-4 true) but went 2-0 -> very lucky
  assert.equal(c.wins, 0)
  assert.ok(c.luck > 0, 'worst scorer with best record should show positive luck')
})

test('luck is null when no actual record is supplied for that team', () => {
  const rows = computeTrueRecord([week(1, [['A', 100], ['B', 90]])])
  assert.equal(rows[0].luck, null)
})

test('skips weeks with fewer than two scores instead of crashing', () => {
  const rows = computeTrueRecord([
    week(1, [['A', 100]]),
    week(2, [['A', 100], ['B', 90]]),
  ])
  assert.equal(rows.find((r) => r.teamName === 'A').weeksPlayed, 1)
})

test('ignores non-numeric scores rather than counting them as zero', () => {
  const rows = computeTrueRecord([
    { week: 1, scores: [{ teamName: 'A', points: 100 }, { teamName: 'B', points: null }, { teamName: 'C', points: 80 }] },
  ])
  assert.equal(rows.length, 2)
  assert.equal(rows.find((r) => r.teamName === 'A').wins, 1)
})

test('handles empty input', () => {
  assert.deepEqual(computeTrueRecord([]), [])
  assert.deepEqual(computeTrueRecord(undefined), [])
})

test('parseWeekScores reads tab, comma, and multi-space separated lines', () => {
  const { scores, errors } = parseWeekScores('Jared\t128.4\nBill, 134\nM. Zurek   130.88')
  assert.equal(errors.length, 0)
  assert.deepEqual(scores, [
    { teamName: 'Jared', points: 128.4 },
    { teamName: 'Bill', points: 134 },
    { teamName: 'M. Zurek', points: 130.88 },
  ])
})

test('parseWeekScores keeps multi-word team names intact with a single space separator', () => {
  const { scores, errors } = parseWeekScores('M. Zurek 130.88')
  assert.equal(errors.length, 0)
  assert.deepEqual(scores, [{ teamName: 'M. Zurek', points: 130.88 }])
})

test('parseWeekScores reports bad lines instead of silently dropping them', () => {
  const { scores, errors } = parseWeekScores('Jared 128.4\ngarbage-with-no-number\nBill 134')
  assert.equal(scores.length, 2)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /Line 2/)
})

test('parseWeekScores flags a duplicated team', () => {
  const { scores, errors } = parseWeekScores('Jared 128.4\njared 99')
  assert.equal(scores.length, 1)
  assert.match(errors[0], /appears twice/)
})

test('parseWeekScores ignores blank lines', () => {
  const { scores, errors } = parseWeekScores('\nJared 128.4\n\n\nBill 134\n')
  assert.equal(scores.length, 2)
  assert.equal(errors.length, 0)
})
