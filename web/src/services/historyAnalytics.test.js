import test from 'node:test'
import assert from 'node:assert/strict'
import { regularWeeks, headToHead, allPlayWeek, allPlayLuck, clutchFactor, stretchRun } from './historyAnalytics.js'

// One tiny two-season history. Each game appears twice (once per side), the
// way historyMatchups stores it. 2019-era regular season cut is week 13;
// 2021+ is week 14.
const game = (week, a, b, pa, pb) => [
  { week, team: a, opponent: b, points: pa, oppPoints: pb, result: pa > pb ? 'W' : pa < pb ? 'L' : 'T' },
  { week, team: b, opponent: a, points: pb, oppPoints: pa, result: pb > pa ? 'W' : pb < pa ? 'L' : 'T' },
]

const DOCS = [
  {
    season: 2024,
    rows: [
      // 4-team league, 2 regular "weeks" + week 15 playoffs
      ...game(1, 'Jared', 'Bill', 100, 90),
      ...game(1, 'Ryan', 'Abad', 120, 80),
      ...game(2, 'Jared', 'Ryan', 110, 130),
      ...game(2, 'Bill', 'Abad', 95, 95), // tie
      ...game(15, 'Jared', 'Bill', 150, 100),
      ...game(15, 'Ryan', 'Abad', 90, 140),
    ],
  },
  {
    season: 2019,
    rows: [
      ...game(1, 'Jared', 'Bill', 80, 70),
      ...game(14, 'Jared', 'Bill', 200, 60), // week 14 was PLAYOFFS in 2019
    ],
  },
]

test('regularWeeks respects the 2021 schedule change', () => {
  assert.equal(regularWeeks(2020), 13)
  assert.equal(regularWeeks(2021), 14)
  assert.equal(regularWeeks('2025'), 14)
})

test('headToHead counts every meeting incl. playoffs, symmetric, with ties', () => {
  const { teams, grid } = headToHead(DOCS, ['Jared', 'Bill', 'Ryan', 'Abad'])
  // Jared vs Bill: 2024 wk1 W, wk15 W, 2019 wk1 W, wk14 W → 4-0
  assert.deepEqual(grid.Jared.Bill, { w: 4, l: 0, t: 0, games: 4, pct: 1 })
  assert.deepEqual(grid.Bill.Jared, { w: 0, l: 4, t: 0, games: 4, pct: 0 })
  // Bill vs Abad tied once
  assert.deepEqual(grid.Bill.Abad, { w: 0, l: 0, t: 1, games: 1, pct: 0.5 })
  // Ordered by overall win% — Jared (5-1) first
  assert.equal(teams[0], 'Jared')
})

test('headToHead ignores teams outside the requested set', () => {
  const { grid } = headToHead(DOCS, ['Jared', 'Bill'])
  assert.equal(grid.Jared.Ryan, undefined)
  assert.equal(grid.Jared.Bill.games, 4)
})

test('allPlayWeek shares win slots across ties', () => {
  const ap = allPlayWeek([
    { team: 'A', points: 100 },
    { team: 'B', points: 90 },
    { team: 'C', points: 90 },
    { team: 'D', points: 50 },
  ])
  assert.equal(ap.get('A'), 3)
  // B and C tie for slots worth 2 and 1 wins → 1.5 each
  assert.equal(ap.get('B'), 1.5)
  assert.equal(ap.get('C'), 1.5)
  assert.equal(ap.get('D'), 0)
})

test('allPlayLuck uses only regular-season weeks and scales to one game per week', () => {
  const { seasons, career } = allPlayLuck([DOCS[0]])
  const rows = Object.fromEntries(seasons.map((r) => [r.team, r]))
  // Week 1 all-play (4 teams): Ryan 120→3/3, Jared 100→2/3, Bill 90→1/3, Abad 80→0
  // Week 2 all-play: Ryan 130→3/3, Jared 110→2/3, Bill/Abad tie 95→(1+0)/2=0.5→0.5/3
  // Week 15 excluded (playoffs).
  assert.equal(rows.Ryan.actualWins, 2)
  assert.equal(rows.Ryan.expectedWins, 2)
  assert.equal(rows.Ryan.luck, 0)
  assert.equal(rows.Jared.actualWins, 1) // beat Bill, lost to Ryan
  assert.ok(Math.abs(rows.Jared.expectedWins - 4 / 3) < 1e-9)
  assert.ok(rows.Jared.luck < 0) // scored 2nd both weeks, only 1 win — unlucky
  assert.equal(rows.Bill.actualWins, 0.5) // loss + tie
  // Career for a single season mirrors the season rows
  const jared = career.find((c) => c.team === 'Jared')
  assert.equal(jared.seasons, 1)
  assert.ok(Math.abs(jared.luck - (1 - 4 / 3)) < 1e-9)
  // Sorted unluckiest first
  assert.ok(seasons[0].luck <= seasons[seasons.length - 1].luck)
})

test('allPlayLuck skips weeks with a single valid score', () => {
  const { seasons } = allPlayLuck([
    { season: 2024, rows: [{ week: 1, team: 'Jared', opponent: 'Bill', points: 100, result: 'W' }] },
  ])
  assert.equal(seasons.length, 0)
})

test('clutchFactor splits regular vs postseason by era', () => {
  const rows = clutchFactor(DOCS)
  const jared = rows.find((r) => r.team === 'Jared')
  // Regular: 2024 wks 1-2 (100, 110) + 2019 wk1 (80) → 290/3
  // Post: 2024 wk15 (150) + 2019 wk14 (200 — playoffs in the 13-game era) → 350/2
  assert.equal(jared.regGames, 3)
  assert.equal(jared.postGames, 2)
  assert.ok(Math.abs(jared.regPPG - 290 / 3) < 1e-9)
  assert.ok(Math.abs(jared.postPPG - 175) < 1e-9)
  assert.ok(Math.abs(jared.delta - (175 - 290 / 3)) < 1e-9)
  // Sorted best delta first
  assert.ok(rows[0].delta >= rows[rows.length - 1].delta)
})

test('clutchFactor drops teams with no postseason games', () => {
  const rows = clutchFactor([
    { season: 2024, rows: [...game(1, 'Jared', 'Bill', 100, 90)] },
  ])
  assert.equal(rows.length, 0)
})

// 2019 regular season is 13 weeks, so the midpoint split is weeks 1-7 / 8-13
// (ceil(13/2) = 7). Jared fades, Bill surges; week 14 is playoffs and must be
// ignored by the split entirely.
const STRETCH_2019 = {
  season: 2019,
  rows: [
    ...Array.from({ length: 7 }, (_, i) => game(i + 1, 'Jared', 'Bill', 100, 90)).flat(),
    ...Array.from({ length: 6 }, (_, i) => game(i + 8, 'Jared', 'Bill', 80, 110)).flat(),
    ...game(14, 'Jared', 'Bill', 999, 999), // postseason — must not leak into either half
  ],
}

test('stretchRun splits at the era midpoint and finds fade vs surge', () => {
  const { seasons } = stretchRun([STRETCH_2019])
  const jared = seasons.find((r) => r.team === 'Jared' && r.season === 2019)
  const bill = seasons.find((r) => r.team === 'Bill' && r.season === 2019)

  assert.equal(jared.firstGames, 7)
  assert.equal(jared.secondGames, 6)
  assert.ok(Math.abs(jared.firstPPG - 100) < 1e-9)
  assert.ok(Math.abs(jared.secondPPG - 80) < 1e-9)
  assert.ok(Math.abs(jared.delta - (-20)) < 1e-9)

  assert.ok(Math.abs(bill.firstPPG - 90) < 1e-9)
  assert.ok(Math.abs(bill.secondPPG - 110) < 1e-9)
  assert.ok(Math.abs(bill.delta - 20) < 1e-9)

  // Sorted biggest fade first
  assert.equal(seasons[0].team, 'Jared')
  assert.equal(seasons[seasons.length - 1].team, 'Bill')
})

test('stretchRun career aggregates across seasons', () => {
  // A second, 14-week-era season (2021+) for Jared only, same shape of fade.
  const STRETCH_2024 = {
    season: 2024,
    rows: [
      ...Array.from({ length: 7 }, (_, i) => game(i + 1, 'Jared', 'Bill', 100, 90)).flat(),
      ...Array.from({ length: 7 }, (_, i) => game(i + 8, 'Jared', 'Bill', 80, 60)).flat(),
    ],
  }
  const { career } = stretchRun([STRETCH_2019, STRETCH_2024])
  const jared = career.find((c) => c.team === 'Jared')
  // firstGames: 7 + 7 = 14, first points: 700 + 700 = 1400 → firstPPG 100
  // secondGames: 6 + 7 = 13, second points: 480 + 560 = 1040 → secondPPG 80
  assert.equal(jared.seasons, 2)
  assert.ok(Math.abs(jared.firstPPG - 100) < 1e-9)
  assert.ok(Math.abs(jared.secondPPG - (1040 / 13)) < 1e-9)
  assert.ok(Math.abs(jared.delta - (1040 / 13 - 100)) < 1e-9)
})

test('stretchRun excludes a season with no games on one side of the split (no NaN/Infinity)', () => {
  // Only weeks 1-2 played — nothing past the week-7 midpoint.
  const onlyFirstHalf = {
    season: 2019,
    rows: [...game(1, 'Jared', 'Bill', 100, 90), ...game(2, 'Jared', 'Bill', 95, 85)],
  }
  const { seasons, career } = stretchRun([onlyFirstHalf])
  assert.equal(seasons.length, 0)
  assert.equal(career.length, 0)
})
