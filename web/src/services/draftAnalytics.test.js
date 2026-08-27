import test from 'node:test'
import assert from 'node:assert/strict'
import { scoringEras, positionSpendShare, draftROI, SPEND_POSITIONS } from './draftAnalytics.js'

const SCORING = {
  seasons: [
    {
      season: 2024, leagueAvgPPG: 100,
      teams: [
        { team: 'Jared', ppg: 120, pointsFor: 1680, games: 14 },
        { team: 'Bill', ppg: 90, pointsFor: 1260, games: 14 },
        { team: 'Eric', ppg: 130, pointsFor: 1820, games: 14 }, // former member
      ],
    },
    {
      season: 2025, leagueAvgPPG: 140,
      teams: [
        { team: 'Jared', ppg: 145, pointsFor: 2030, games: 14 },
        { team: 'Bill', ppg: 100, pointsFor: 1400, games: 14 },
      ],
    },
  ],
}

const DRAFT = {
  positionSpend: [
    { season: 2025, total: 200, byPosition: { QB: 50, RB: 60, WR: 70, TE: 10, 'D/ST': 4, K: 0, LB: 6 } },
    { season: 2024, total: 100, byPosition: { QB: 10, RB: 50, WR: 30, TE: 10 } },
  ],
  roi: [
    { season: 2024, team: 'Jared', picks: 10, spend: 100, points: 1500, ptsPerDollar: 15 },
    { season: 2025, team: 'Jared', picks: 10, spend: 100, points: 1000, ptsPerDollar: 10 },
    { season: 2024, team: 'Bill', picks: 10, spend: 200, points: 1000, ptsPerDollar: 5 },
    { season: 2025, team: 'Eric', picks: 10, spend: 100, points: 2000, ptsPerDollar: 20 },
    { season: 2025, team: 'Bill', picks: 2, spend: 5, points: 400, ptsPerDollar: 80 }, // too few picks to be a "class"
  ],
}

test('scoringEras measures each team against its own season average', () => {
  const r = scoringEras(SCORING)
  const jared = r.teams.find((t) => t.team === 'Jared')
  assert.deepEqual(jared.points.map((p) => p.season), [2024, 2025])
  assert.equal(jared.points[0].vsAvg, 20) // 120 vs 100
  assert.equal(jared.points[1].vsAvg, 5) // 145 vs 140 — higher PPG, weaker season
  const bill = r.teams.find((t) => t.team === 'Bill')
  assert.equal(bill.points[0].vsAvg, -10)
  assert.equal(bill.points[1].vsAvg, -40)
  assert.deepEqual(r.seasons, [
    { season: 2024, leagueAvgPPG: 100 },
    { season: 2025, leagueAvgPPG: 140 },
  ])
})

test('scoringEras finds the best and worst season relative to era', () => {
  const r = scoringEras(SCORING)
  assert.equal(r.bestEver.team, 'Eric')
  assert.equal(r.bestEver.vsAvg, 30)
  assert.equal(r.worstEver.team, 'Bill')
  assert.equal(r.worstEver.vsAvg, -40)
})

test('scoringEras honours the include filter (former members)', () => {
  const r = scoringEras(SCORING, (t) => t !== 'Eric')
  assert.ok(!r.teams.some((t) => t.team === 'Eric'))
  assert.equal(r.bestEver.team, 'Jared') // Eric's +30 is gone
  // Season list is unfiltered — the league average still comes from everyone
  assert.equal(r.seasons.length, 2)
})

test('scoringEras tolerates an empty or missing doc', () => {
  for (const input of [null, undefined, {}, { seasons: [] }]) {
    const r = scoringEras(input)
    assert.deepEqual(r.teams, [])
    assert.equal(r.bestEver, null)
    assert.equal(r.worstEver, null)
  }
})

test('positionSpendShare returns shares that total 1 with an Other band', () => {
  const rows = positionSpendShare(DRAFT)
  assert.deepEqual(rows.map((r) => r.season), [2024, 2025]) // sorted ascending
  const y2025 = rows[1]
  assert.equal(y2025.shares.QB, 0.25)
  assert.equal(y2025.shares.RB, 0.3)
  assert.equal(y2025.shares.K, 0)
  assert.equal(y2025.shares.Other, 6 / 200) // the LB spend
  const total = [...SPEND_POSITIONS, 'Other'].reduce((a, p) => a + y2025.shares[p], 0)
  assert.ok(Math.abs(total - 1) < 1e-9)
})

test('positionSpendShare handles a season with no spend', () => {
  const rows = positionSpendShare({ positionSpend: [{ season: 2020, total: 0, byPosition: {} }] })
  assert.equal(rows[0].shares.QB, 0)
  assert.equal(rows[0].shares.Other, 0)
})

test('draftROI aggregates career points per dollar', () => {
  const r = draftROI(DRAFT)
  const jared = r.career.find((c) => c.team === 'Jared')
  assert.equal(jared.spend, 200)
  assert.equal(jared.points, 2500)
  assert.equal(jared.ptsPerDollar, 12.5)
  assert.equal(jared.seasons, 2)
  const bill = r.career.find((c) => c.team === 'Bill')
  assert.equal(bill.spend, 205) // both drafts, including the tiny one
  // Sorted best first
  assert.equal(r.career[0].team, 'Eric')
})

test('draftROI ignores thin drafts when picking best/worst class', () => {
  const r = draftROI(DRAFT)
  assert.equal(r.bestClass.team, 'Eric') // 20/$; Bill's 80/$ on 2 picks is excluded
  assert.equal(r.bestClass.ptsPerDollar, 20)
  assert.equal(r.worstClass.team, 'Bill')
  assert.equal(r.worstClass.season, 2024)
})

test('draftROI honours the include filter and skips zero-spend rows', () => {
  const r = draftROI({ roi: [...DRAFT.roi, { season: 2025, team: 'Ghost', picks: 9, spend: 0, points: 10 }] }, (t) => t !== 'Eric')
  assert.ok(!r.career.some((c) => c.team === 'Eric'))
  assert.ok(!r.career.some((c) => c.team === 'Ghost'))
  assert.equal(r.bestClass.team, 'Jared')
})
