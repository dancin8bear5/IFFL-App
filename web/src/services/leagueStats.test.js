import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRecord, computeAllTimeStats, computeRecords, defaultSort } from './leagueStats.js'

const HISTORY = [
  {
    season: 2024, champion: 'Bill', runnerUp: 'Abad',
    standings: [
      { teamName: 'Bill', place: 1, record: '12-2', pointsFor: 1900 },
      { teamName: 'Abad', place: 2, record: '9-5', pointsFor: 1780 },
      { teamName: 'Jared', place: 3, record: '9-5', pointsFor: 1750 },
      { teamName: 'Ryan', place: 7, record: '6-8', pointsFor: 1600 },
    ],
  },
  {
    season: 2025, champion: 'Bill', runnerUp: 'Jared',
    standings: [
      { teamName: 'Bill', place: 1, record: '11-3', pointsFor: 1890 },
      { teamName: 'Jared', place: 2, record: '10-3-1', pointsFor: 1850 },
      { teamName: 'Abad', place: 4, record: '8-6', pointsFor: 1700 },
      { teamName: 'Ryan', place: 6, record: '7-7', pointsFor: 1650 },
    ],
  },
]

test('parseRecord handles W-L and W-L-T and junk', () => {
  assert.deepEqual(parseRecord('11-3'), { w: 11, l: 3, t: 0 })
  assert.deepEqual(parseRecord('10-3-1'), { w: 10, l: 3, t: 1 })
  assert.deepEqual(parseRecord(null), { w: 0, l: 0, t: 0 })
})

test('career totals accumulate across seasons', () => {
  const rows = computeAllTimeStats(HISTORY)
  const bill = rows.find((r) => r.team === 'Bill')
  assert.equal(bill.seasons, 2)
  assert.equal(bill.w, 23)
  assert.equal(bill.l, 5)
  assert.equal(bill.championships, 2)
  assert.equal(bill.finals, 2)
  assert.equal(bill.top3, 2)
  assert.equal(bill.playoffs, 2)
  assert.equal(bill.pointsFor, 3790)
  assert.equal(bill.bestFinish, 1)
})

test('ties count as half-wins in pct; finals = champ + runner-up', () => {
  const rows = computeAllTimeStats(HISTORY)
  const jared = rows.find((r) => r.team === 'Jared')
  // 19W 8L 1T → (19 + 0.5) / 28
  assert.ok(Math.abs(jared.pct - 19.5 / 28) < 1e-9)
  assert.equal(jared.finals, 1) // runner-up 2025
  assert.equal(jared.championships, 0)
})

test('playoff cutoff is top 6', () => {
  const rows = computeAllTimeStats(HISTORY)
  const ryan = rows.find((r) => r.team === 'Ryan')
  assert.equal(ryan.playoffs, 1) // 7th in 2024 misses, 6th in 2025 makes it
})

test('defaultSort puts most belts first', () => {
  const sorted = defaultSort(computeAllTimeStats(HISTORY))
  assert.equal(sorted[0].team, 'Bill')
})

test('records wall includes title streak for back-to-back champs', () => {
  const rows = computeAllTimeStats(HISTORY)
  const records = computeRecords(rows, HISTORY)
  const streak = records.find((r) => r.label === 'Longest Title Streak')
  assert.ok(streak)
  assert.equal(streak.team, 'Bill')
  assert.equal(streak.value, '2 straight')
})
