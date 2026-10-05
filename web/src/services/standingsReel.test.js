import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRecord, weekNumbers, buildReel, liveGameFor, beats, rowAt, barAt, currentWeekIndex } from './standingsReel.js'

// Real shape, three teams: A 2-1, B 2-1, C 1-2 after three weeks.
const standings = [
  { teamName: 'B', place: 2, record: '2-1', pointsFor: 300 },
  { teamName: 'A', place: 1, record: '2-1', pointsFor: 330 },
  { teamName: 'C', place: 3, record: '1-2', pointsFor: 270 },
]
const weekly = {
  1: [{ teamName: 'A', points: 100 }, { teamName: 'B', points: 120 }, { teamName: 'C', points: 90 }],
  2: [{ teamName: 'A', points: 110 }, { teamName: 'B', points: 80 }, { teamName: 'C', points: 95 }],
  3: [{ teamName: 'A', points: 120 }, { teamName: 'B', points: 100 }, { teamName: 'C', points: 85 }],
}

test('parseRecord handles W-L, W-L-T and junk', () => {
  assert.deepEqual(parseRecord('3-0'), { wins: 3, losses: 0, ties: 0 })
  assert.deepEqual(parseRecord('2-1-1'), { wins: 2, losses: 1, ties: 1 })
  assert.deepEqual(parseRecord(null), { wins: 0, losses: 0, ties: 0 })
})

test('weekNumbers sorts numerically and drops empty weeks', () => {
  assert.deepEqual(weekNumbers({ 10: [{}], 2: [{}], 1: [{}], 3: [] }), [1, 2, 10])
})

test('no standings → null, so the section still renders nothing', () => {
  assert.equal(buildReel([], weekly), null)
  assert.equal(buildReel(undefined, weekly), null)
})

test('final frame is ESPN place order, never recomputed', () => {
  const r = buildReel(standings, weekly)
  assert.deepEqual(r.teams, ['A', 'B', 'C'])
  assert.deepEqual(r.frames.at(-1), { A: 0, B: 1, C: 2 })
})

test('kickoff is alphabetical; week frames rank by cumulative points', () => {
  const r = buildReel(standings, weekly)
  assert.deepEqual(r.frames[0], { A: 0, B: 1, C: 2 })
  assert.deepEqual(r.frames[1], { B: 0, A: 1, C: 2 })       // wk1: B 120, A 100, C 90
  assert.deepEqual(r.frames[2], { A: 0, B: 1, C: 2 })       // wk2: A 210, B 200, C 185
  assert.deepEqual(r.cumulative.A, [100, 210, 330])
})

test('weekly extremes', () => {
  const r = buildReel(standings, weekly)
  assert.deepEqual(r.extremes[0], { high: 'B', low: 'C' })
  assert.deepEqual(r.extremes[1], { high: 'A', low: 'B' })
})

test('all-play and luck', () => {
  const r = buildReel(standings, weekly)
  // A beat everyone in wk2 and wk3, beat C in wk1 → 5-1 all-play.
  assert.deepEqual(r.allPlay.A, { wins: 5, losses: 1, ties: 0 })
  // C beat B in wk2 only → 1-5; expected 0.5 wins, has 1 → +0.5 luck.
  assert.equal(r.luckValid, true)
  assert.ok(Math.abs(r.luck.C - 0.5) < 1e-9)
  assert.ok(Math.abs(r.luck.A - (2 - 2.5)) < 1e-9)
})

test('canary: luck is hidden when weekly docs lag ESPN', () => {
  const r = buildReel(standings, { 1: weekly[1], 2: weekly[2] })   // 2 weeks, 3 games played
  assert.equal(r.luckValid, false)
  assert.equal(r.luck.A, null)
})

test('unbeaten and cut place', () => {
  const r = buildReel([{ teamName: 'X', place: 1, record: '3-0', pointsFor: 1 }, ...standings.map((s) => ({ ...s, place: s.place + 1 }))], weekly)
  assert.deepEqual(r.unbeaten, ['X'])
  assert.equal(r.cutPlace, 4)                 // fewer teams than spots → everyone
})

test('liveGameFor finds either side', () => {
  const board = { week: 4, games: [{ home: 'A', away: 'C', homeScore: 50.5, awayScore: 0, final: false }] }
  assert.deepEqual(liveGameFor(board, 'C'), { opponent: 'A', mine: 0, theirs: 50.5, final: false, started: true, week: 4 })
  assert.equal(liveGameFor(board, 'B'), null)
  assert.equal(liveGameFor(null, 'A'), null)
})

test('timeline: rows go kickoff → standings, bars grow, week index advances', () => {
  const r = buildReel(standings, weekly)
  const start = beats(0, 3), end = beats(1, 3)
  assert.equal(rowAt(r, 'B', start), 1)
  assert.equal(rowAt(r, 'B', end), 1)
  assert.equal(rowAt(r, 'C', end), 2)
  assert.equal(currentWeekIndex(start), 0)
  assert.equal(currentWeekIndex(end), 3)
  assert.equal(barAt(r, 'A', start).value, 0)
  assert.ok(Math.abs(barAt(r, 'A', end).value - 330) < 1e-6)
  const mid = beats(0.3, 3)
  assert.ok(currentWeekIndex(mid) >= 1 && currentWeekIndex(mid) <= 2)
})
