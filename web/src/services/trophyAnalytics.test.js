import test from 'node:test'
import assert from 'node:assert/strict'
import { median, finishRanges, finishGrid, salaryRanges, keeperRanges } from './trophyAnalytics.js'

const history = [
  { season: 2024, standings: [
    { teamName: 'Jared', place: 1, record: '11-3' },
    { teamName: 'Bill', place: 6, record: '7-7' },
    { teamName: 'Eric', place: 12, record: '2-12' }, // former member
  ] },
  { season: 2025, standings: [
    { teamName: 'Jared', place: 9, record: '5-9' },
    { teamName: 'Bill', place: 5, record: '8-6' },
  ] },
  { season: 2023, standings: [
    { teamName: 'Jared', place: 3, record: '9-5' },
    { teamName: 'Bill', place: 4, record: '9-5' },
  ] },
]
const by = (rows, team) => rows.find((r) => r.team === team)

test('median handles odd, even and empty', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 2, 3]), 2.5)
  assert.equal(median([]), null)
})

test('finish range reports best, worst, median and volatility', () => {
  const rows = finishRanges(history)
  const j = by(rows, 'Jared')
  assert.deepEqual([j.best, j.worst, j.med], [1, 9, 3])
  assert.equal(j.volatility, 8, 'a 1st and a 9th is a rollercoaster')
  const b = by(rows, 'Bill')
  assert.deepEqual([b.best, b.worst, b.med], [4, 6, 5])
  assert.equal(b.volatility, 2, 'Bill is steady')
})

test('rows sort by median finish, best first', () => {
  const rows = finishRanges(history)
  assert.deepEqual(rows.map((r) => r.team), ['Jared', 'Bill'])
})

test('former members are excluded unless asked for', () => {
  assert.equal(by(finishRanges(history), 'Eric'), undefined)
  assert.ok(by(finishRanges(history, false), 'Eric'))
})

test('finishes come back in season order regardless of input order', () => {
  const j = by(finishRanges(history), 'Jared')
  assert.deepEqual(j.finishes.map((f) => f.season), [2023, 2024, 2025])
  assert.deepEqual(j.finishes.map((f) => f.place), [3, 1, 9])
})

test('grid columns are every season ascending, with gaps left sparse', () => {
  const g = finishGrid(history)
  assert.deepEqual(g.seasons, [2023, 2024, 2025])
  const bill = g.rows.find((r) => r.team === 'Bill')
  assert.equal(bill.places.get(2024), 6)
  // Bill played all three; a team that missed a year must read undefined,
  // never a number that would paint as a bad finish.
  const partial = finishGrid([
    { season: 2024, standings: [{ teamName: 'Bill', place: 2 }] },
    { season: 2025, standings: [{ teamName: 'Bill', place: 3 }, { teamName: 'Jared', place: 1 }] },
  ])
  const jared = partial.rows.find((r) => r.team === 'Jared')
  assert.equal(jared.places.get(2024), undefined)
  assert.equal(jared.places.get(2025), 1)
})

test('grid reports the deepest finish so the ramp can scale to it', () => {
  assert.equal(finishGrid(history, false).maxPlace, 12)
  assert.equal(finishGrid(history).maxPlace, 9, 'Eric filtered out lowers the floor')
})

const teams = [{ name: 'Jared' }, { name: 'Bill' }]
const assets = [
  { teamName: 'Jared', currentPrice: 10, isPick: false },
  { teamName: 'Jared', currentPrice: 90, isPick: false },
  { teamName: 'Jared', currentPrice: 50, isPick: false },
  { teamName: 'Jared', currentPrice: 999, isPick: true },   // pick, must be ignored
  { teamName: 'Bill', currentPrice: 20, isPick: false },
  { teamName: 'Nobody', currentPrice: 40, isPick: false },  // not a franchise
]

test('salary range ignores picks and unknown teams', () => {
  const rows = salaryRanges(assets, teams)
  const j = by(rows, 'Jared')
  assert.equal(j.count, 3, 'the pick must not count as a salary')
  assert.deepEqual([j.min, j.med, j.max, j.total], [10, 50, 90, 150])
  assert.equal(rows.length, 2, 'Nobody is not a franchise')
})

test('salary rows sort by total spend, biggest first', () => {
  assert.deepEqual(salaryRanges(assets, teams).map((r) => r.team), ['Jared', 'Bill'])
})

test('keeper range drops anyone over the keeper line', () => {
  const rows = keeperRanges(assets, teams, 60)
  const j = by(rows, 'Jared')
  assert.equal(j.count, 2, '$90 is not keepable')
  assert.deepEqual([j.min, j.max, j.total], [10, 50, 60])
})

test('a team with no qualifying players reports zeros, not NaN', () => {
  const rows = keeperRanges([{ teamName: 'Bill', currentPrice: 200, isPick: false }], teams, 60)
  const b = by(rows, 'Bill')
  assert.deepEqual([b.count, b.min, b.max, b.med, b.total], [0, 0, 0, 0, 0])
  for (const r of rows) for (const k of ['min', 'max', 'med', 'total']) {
    assert.ok(Number.isFinite(r[k]), `${r.team}.${k} was ${r[k]}`)
  }
})

test('empty and missing history do not throw', () => {
  assert.deepEqual(finishRanges([]), [])
  assert.deepEqual(finishRanges(null), [])
  assert.deepEqual(finishGrid(null).seasons, [])
  assert.deepEqual(salaryRanges(null, teams).map((r) => r.count), [0, 0])
})
