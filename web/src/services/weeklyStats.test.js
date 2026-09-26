import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  weeksFromMap, median, competitionRank, teamAverages,
  computeSeasonScoring, latestWeek,
} from './weeklyStats.js'

const wk = (week, pairs) => [week, pairs.map(([teamName, points]) => ({ teamName, points }))]

const SAMPLE = Object.fromEntries([
  wk(1, [['Jared', 120], ['Bill', 100], ['Ryan', 140], ['Dugan', 80]]),
  wk(2, [['Jared', 90],  ['Bill', 130], ['Ryan', 110], ['Dugan', 150]]),
])

// ── weeksFromMap ───────────────────────────────────────────────

test('weeksFromMap sorts numerically, not as strings', () => {
  const map = Object.fromEntries([
    wk(10, [['A', 1], ['B', 2]]),
    wk(2,  [['A', 1], ['B', 2]]),
    wk(1,  [['A', 1], ['B', 2]]),
  ])
  assert.deepEqual(weeksFromMap(map).map((w) => w.week), [1, 2, 10])
})

test('weeksFromMap drops missing scores rather than reading them as zero', () => {
  const map = { 1: [
    { teamName: 'Jared', points: 120 },
    { teamName: 'Bill', points: null },
    { teamName: 'Ryan', points: '' },
    { teamName: 'Dugan', points: undefined },
    { teamName: '', points: 99 },          // no team name
  ] }
  const [week] = weeksFromMap(map)
  assert.deepEqual(week.scores, [{ teamName: 'Jared', points: 120 }])
})

test('weeksFromMap coerces numeric strings', () => {
  const [week] = weeksFromMap({ 1: [{ teamName: 'Jared', points: '120.5' }] })
  assert.equal(week.scores[0].points, 120.5)
})

test('weeksFromMap tolerates null/undefined input', () => {
  assert.deepEqual(weeksFromMap(null), [])
  assert.deepEqual(weeksFromMap(undefined), [])
  assert.deepEqual(weeksFromMap({}), [])
})

test('weeksFromMap drops a week left with no usable scores', () => {
  const map = { 1: [{ teamName: 'Jared', points: null }], 2: [{ teamName: 'Bill', points: 100 }] }
  assert.deepEqual(weeksFromMap(map).map((w) => w.week), [2])
})

// ── median ─────────────────────────────────────────────────────

test('median averages the two middle values on an even count', () => {
  assert.equal(median([80, 100, 120, 140]), 110)
})

test('median takes the middle value on an odd count', () => {
  assert.equal(median([100, 80, 120]), 100)
})

test('median of an empty list is null, not zero', () => {
  assert.equal(median([]), null)
})

// ── competitionRank ────────────────────────────────────────────

test('competitionRank ties share a rank and skip the next slots', () => {
  const r = competitionRank([
    { key: 'a', value: 100 }, { key: 'b', value: 90 },
    { key: 'c', value: 90 },  { key: 'd', value: 80 },
  ])
  assert.equal(r.get('a'), 1)
  assert.equal(r.get('b'), 2)
  assert.equal(r.get('c'), 2)
  assert.equal(r.get('d'), 4)   // 3 is consumed by the tie
})

// ── teamAverages ───────────────────────────────────────────────

test('teamAverages divides by weeks actually played, not weeks in the season', () => {
  // Bill only played week 1 — his average is his one score, not half of it.
  const weeks = weeksFromMap(Object.fromEntries([
    wk(1, [['Jared', 100], ['Bill', 200]]),
    wk(2, [['Jared', 200]]),
  ]))
  const avgs = teamAverages(weeks)
  assert.equal(avgs.find((t) => t.teamName === 'Bill').avg, 200)
  assert.equal(avgs.find((t) => t.teamName === 'Jared').avg, 150)
})

test('teamAverages sorts best average first', () => {
  const avgs = teamAverages(weeksFromMap(SAMPLE))
  assert.equal(avgs[0].teamName, 'Ryan')   // 125 avg
})

// ── computeSeasonScoring ───────────────────────────────────────

test('computeSeasonScoring reports the viewing team per week', () => {
  const s = computeSeasonScoring(weeksFromMap(SAMPLE), 'Jared')
  assert.deepEqual(s.points.map((p) => p.mine), [120, 90])
  assert.equal(s.avgPPG, 105)
})

test('computeSeasonScoring ranks by average, best first', () => {
  const s = computeSeasonScoring(weeksFromMap(SAMPLE), 'Jared')
  // Ryan 125, Bill 115, Dugan 115, Jared 105
  assert.equal(s.rank, 4)
  assert.equal(s.teamCount, 4)
})

test('computeSeasonScoring gives league context per week', () => {
  const s = computeSeasonScoring(weeksFromMap(SAMPLE), 'Jared')
  assert.equal(s.points[0].high, 140)
  assert.equal(s.points[0].low, 80)
  assert.equal(s.points[0].median, 110)   // (100+120)/2
})

test('computeSeasonScoring leaves league context null on a one-team week', () => {
  const weeks = weeksFromMap({ 1: [{ teamName: 'Jared', points: 120 }] })
  const s = computeSeasonScoring(weeks, 'Jared')
  assert.equal(s.points[0].mine, 120)
  assert.equal(s.points[0].median, null)
  assert.equal(s.points[0].high, null)
})

test('computeSeasonScoring marks a week the viewer has no score for as a gap', () => {
  const weeks = weeksFromMap(Object.fromEntries([
    wk(1, [['Jared', 120], ['Bill', 100]]),
    wk(2, [['Bill', 130], ['Ryan', 110]]),   // Jared absent
  ]))
  const s = computeSeasonScoring(weeks, 'Jared')
  assert.equal(s.points[1].mine, null)
  assert.equal(s.avgPPG, 120)   // not averaged against a phantom zero
})

test('computeSeasonScoring best/worst name the week, not just the score', () => {
  const s = computeSeasonScoring(weeksFromMap(SAMPLE), 'Jared')
  assert.deepEqual(s.best, { week: 1, points: 120 })
  assert.deepEqual(s.worst, { week: 2, points: 90 })
})

test('computeSeasonScoring returns league context for a member with no team', () => {
  const s = computeSeasonScoring(weeksFromMap(SAMPLE), '')
  assert.equal(s.avgPPG, null)
  assert.equal(s.rank, null)
  assert.equal(s.best, null)
  assert.equal(s.teamCount, 4)          // league context still works
  assert.equal(s.points[0].high, 140)
})

test('computeSeasonScoring on an empty season is all nulls, no throw', () => {
  const s = computeSeasonScoring([], 'Jared')
  assert.equal(s.weekCount, 0)
  assert.equal(s.avgPPG, null)
  assert.equal(s.leagueAvg, null)
  assert.deepEqual(s.points, [])
})

// ── latestWeek ─────────────────────────────────────────────────

test('latestWeek picks the highest week number and ranks it', () => {
  const l = latestWeek(weeksFromMap(SAMPLE))
  assert.equal(l.week, 2)
  assert.equal(l.rows[0].teamName, 'Dugan')   // 150
  assert.equal(l.rows[0].rank, 1)
  assert.equal(l.rows[3].teamName, 'Jared')   // 90
})

test('latestWeek is null with no weeks entered', () => {
  assert.equal(latestWeek([]), null)
})
